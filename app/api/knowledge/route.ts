import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { OpenAIEmbeddings } from "@langchain/openai";

// @ts-expect-error - Langchain types issue
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
// @ts-expect-error - pdf-parse types issue
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

    // 1. Cek User Login
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Cek Role di Database (Konsisten dengan Middleware)
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    // Hanya Owner & Admin yang boleh upload
    if (!profile || (profile.role !== 'admin' && profile.role !== 'owner')) {
        // Catat percobaan akses ilegal ke Audit Log
        await supabase.from('audit_logs').insert({
            user_id: user.id,
            action: 'unauthorized_upload_attempt',
            details: { email: user.email }
        });
        return NextResponse.json({ error: 'Forbidden: Access Denied' }, { status: 403 });
    }

    // 3. Proses File
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const data = await pdf(buffer);
    const rawText = data.text;

    // 4. Chunking & Embedding
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
    const docs = await splitter.createDocuments([rawText]);

    const embeddings = new OpenAIEmbeddings({ apiKey: process.env.OPENAI_API_KEY });

    // 5. Simpan ke Vector Store
    for (const doc of docs) {
      const embeddingVector = await embeddings.embedQuery(doc.pageContent);
      
      const { error } = await supabase.from('knowledge').insert({
          content: doc.pageContent,
          metadata: { source: file.name, uploaded_by: user.email },
          embedding: embeddingVector
        });

      if (error) throw error;
    }

    // 6. Catat Aktivitas Sukses ke Audit Log
    await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'upload_knowledge',
        details: { filename: file.name, chunks: docs.length }
    });

    return NextResponse.json({ success: true, chunks: docs.length });

  } catch (error) {
    console.error('Upload Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}