import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
// @ts-expect-error - pdf-parse does not have type definitions
import pdf from 'pdf-parse';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  console.log("🚀 [API START] Request masuk ke /api/knowledge (Mode: Google Gemini)");

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

    // 2. Cek Role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || (profile.role !== 'admin' && profile.role !== 'owner')) {
        return NextResponse.json({ error: 'Forbidden: Access Denied' }, { status: 403 });
    }

    // 3. Ambil Data Form
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const textInput = formData.get('text') as string | null;
    const titleInput = formData.get('title') as string | null;

    let rawText = "";
    let sourceName = "";

    if (file) {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const data = await pdf(buffer);
        rawText = data.text;
        sourceName = file.name;
    } else if (textInput && titleInput) {
        rawText = `[JUDUL: ${titleInput}]\n${textInput}`; 
        sourceName = `Manual Note: ${titleInput}`;
    } else {
        return NextResponse.json({ error: 'No file or text provided' }, { status: 400 });
    }

    // 4. Proses Embedding
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
    const docs = await splitter.createDocuments([rawText]);

    // --- MODIFIKASI: PAKE VARIABLE BARU 'GOOGLEAI_API_KEY' ---
    console.log("🧠 [AI] Memulai Embedding via GOOGLE GEMINI...");
    
    // Ganti nama variabel env-nya di sini
    if (!process.env.GOOGLEAI_API_KEY) {
        throw new Error("GOOGLEAI_API_KEY gak ada di env bang!");
    }

    const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GOOGLEAI_API_KEY, // <--- PAKE KEY KHUSUS AI
        modelName: "embedding-001", 
    });

    for (const doc of docs.entries()) {
      const docContent = doc[1].pageContent;
      
      const embeddingVector = await embeddings.embedQuery(docContent);
      
      const { error } = await supabase.from('knowledge').insert({
          content: docContent,
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
    console.error('🔥 [ERROR]:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}