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
  console.log("🚀 [API START] Request masuk ke /api/knowledge");

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
    console.log("🔍 [AUTH] Mengecek user session...");
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !user.email) {
      console.log("❌ [AUTH] Unauthorized");
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log("✅ [AUTH] User verified:", user.email);

    // 2. Cek Role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || (profile.role !== 'admin' && profile.role !== 'owner')) {
        console.log("❌ [AUTH] Role Forbidden:", profile?.role);
        return NextResponse.json({ error: 'Forbidden: Access Denied' }, { status: 403 });
    }
    console.log("✅ [AUTH] Role authorized:", profile.role);

    // 3. Ambil Data Form
    console.log("📦 [DATA] Membaca FormData...");
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const textInput = formData.get('text') as string | null;
    const titleInput = formData.get('title') as string | null;

    let rawText = "";
    let sourceName = "";

    if (file) {
        console.log("📂 [MODE] File Upload detected:", file.name);
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const data = await pdf(buffer);
        rawText = data.text;
        sourceName = file.name;
    } else if (textInput && titleInput) {
        console.log("📝 [MODE] Manual Text Input detected:", titleInput);
        rawText = `[JUDUL: ${titleInput}]\n${textInput}`; 
        sourceName = `Manual Note: ${titleInput}`;
    } else {
        console.log("❌ [DATA] Tidak ada file atau text");
        return NextResponse.json({ error: 'No file or text provided' }, { status: 400 });
    }

    // 4. Proses Embedding
    console.log("✂️ [PROCESS] Splitting text...");
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
    const docs = await splitter.createDocuments([rawText]);
    console.log(`✅ [PROCESS] Terbagi menjadi ${docs.length} chunks`);

    // CEK API KEY SEBELUM EMBEDDING
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY tidak ditemukan di Environment Variables Vercel!");
    }

    console.log("🧠 [AI] Memulai Embedding ke OpenAI...");
    const embeddings = new OpenAIEmbeddings({ 
        apiKey: process.env.OPENAI_API_KEY 
    });

    for (const [index, doc] of docs.entries()) {
      // Log progress per 5 chunk biar gak nyepam
      if (index % 5 === 0) console.log(`⏳ [AI] Embedding chunk ${index + 1}/${docs.length}...`);
      
      const embeddingVector = await embeddings.embedQuery(doc.pageContent);
      
      const { error } = await supabase.from('knowledge').insert({
          content: doc.pageContent,
          metadata: { source: sourceName, uploaded_by: user.email },
          embedding: embeddingVector
        });

      if (error) {
        console.error("❌ [DB] Insert Error:", error);
        throw error;
      }
    }

    // 5. Catat Log
    console.log("📝 [LOG] Menyimpan audit log...");
    await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'add_knowledge',
        details: { source: sourceName, type: file ? 'pdf' : 'text', chunks: docs.length }
    });

    console.log("🎉 [FINISH] Berhasil!");
    return NextResponse.json({ success: true, chunks: docs.length });

  } catch (error) {
    console.error('🔥 [CRITICAL ERROR]:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}