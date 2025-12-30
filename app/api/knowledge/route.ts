import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
// @ts-expect-error - pdf-parse does not have type definitions
import pdf from 'pdf-parse';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
        },
      }
    );

    // 1. Cek User Login & Role
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || (profile.role !== 'admin' && profile.role !== 'owner')) {
        await supabase.from('audit_logs').insert({
            user_id: user.id,
            action: 'unauthorized_upload_attempt',
            details: { email: user.email }
        });
        return NextResponse.json({ error: 'Forbidden: Access Denied' }, { status: 403 });
    }

    // 2. Ambil Data (Bisa File atau Text)
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const textInput = formData.get('text') as string | null;
    const titleInput = formData.get('title') as string | null;

    let rawText = "";
    let sourceName = "";

    // 3. Logic Parsing (Cabang File vs Text)
    if (file) {
        // --- JALUR PDF ---
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const data = await pdf(buffer);
        rawText = data.text;
        sourceName = file.name;
    } else if (textInput && titleInput) {
        // --- JALUR MANUAL TEXT ---
        rawText = `[JUDUL: ${titleInput}]\n${textInput}`; // Tambahin judul di konten biar AI tau konteksnya
        sourceName = `Manual Note: ${titleInput}`;
    } else {
        return NextResponse.json({ error: 'No file or text provided' }, { status: 400 });
    }

    // 4. Proses Embedding (Sama untuk keduanya)
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
    const docs = await splitter.createDocuments([rawText]);

    const embeddings = new OpenAIEmbeddings({ apiKey: process.env.OPENAI_API_KEY });

    for (const doc of docs) {
      const embeddingVector = await embeddings.embedQuery(doc.pageContent);
      
      const { error } = await supabase.from('knowledge').insert({
          content: doc.pageContent,
          metadata: { source: sourceName, uploaded_by: user.email },
          embedding: embeddingVector
        });

      if (error) throw error;
    }

    // 5. Catat Log
    await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'add_knowledge',
        details: { source: sourceName, type: file ? 'pdf' : 'text', chunks: docs.length }
    });

    return NextResponse.json({ success: true, chunks: docs.length });

  } catch (error) {
    console.error('Processing Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}