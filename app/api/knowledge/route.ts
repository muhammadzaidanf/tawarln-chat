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
  console.log("🚀 [API START] Request masuk ke /api/knowledge");

  try {
    // 0. CEK API KEY DULU (Biar gak capek2 jalan ke bawah kalau kunci gak ada)
    const apiKey = process.env.GOOGLEAI_API_KEY;
    if (!apiKey) {
        console.error("🔥 [FATAL ERROR] GOOGLEAI_API_KEY KOSONG/TIDAK DITEMUKAN!");
        console.error("💡 Tips: Pastikan nama di .env sama persis dengan codingan (GOOGLEAI_API_KEY) dan RESTART server.");
        return NextResponse.json({ error: 'Server Config Error: API Key Missing' }, { status: 500 });
    } else {
        console.log(`🔑 [CONFIG] API Key ditemukan (Depan: ${apiKey.substring(0, 5)}...)`);
    }

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
      console.log("❌ [AUTH] Unauthorized");
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Cek Role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || (profile.role !== 'admin' && profile.role !== 'owner')) {
        console.log("❌ [AUTH] Role Forbidden");
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
        console.log("📂 [MODE] Processing PDF...");
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const data = await pdf(buffer);
        rawText = data.text;
        sourceName = file.name;
    } else if (textInput && titleInput) {
        console.log("📝 [MODE] Processing Text Input...");
        rawText = `[JUDUL: ${titleInput}]\n${textInput}`; 
        sourceName = `Manual Note: ${titleInput}`;
    } else {
        return NextResponse.json({ error: 'No file or text provided' }, { status: 400 });
    }

    // 4. Proses Embedding
    console.log("✂️ [PROCESS] Splitting text...");
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
    const docs = await splitter.createDocuments([rawText]);

    // --- GOOGLE GEMINI EMBEDDING ---
    console.log("🧠 [AI] Memulai Embedding ke Google Gemini...");
    
    try {
        const embeddings = new GoogleGenerativeAIEmbeddings({
            apiKey: apiKey, // Pake variabel yg udah dicek di atas
            modelName: "embedding-001", 
        });

        for (const [index, doc] of docs.entries()) {
            console.log(`⏳ [AI] Embedding chunk ${index + 1}/${docs.length}`);
            
            const docContent = doc.pageContent;
            
            // Proses embedding (ini yang biasanya crash kalau key salah)
            const embeddingVector = await embeddings.embedQuery(docContent);
            
            const { error } = await supabase.from('knowledge').insert({
                content: docContent,
                metadata: { source: sourceName, uploaded_by: user.email },
                embedding: embeddingVector
            });

            if (error) {
                console.error("❌ [DB] Insert Error:", error.message);
                throw error;
            }
        }
    } catch (aiError) {
        console.error("🔥 [AI ERROR] Gagal connect ke Google:", aiError);
        // Kita return JSON error biar frontend gak dapet "Unexpected end of JSON"
        const msg = aiError instanceof Error ? aiError.message : "Google AI Error";
        return NextResponse.json({ error: `Google AI Error: ${msg}` }, { status: 500 });
    }

    // 5. Catat Log
    await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'add_knowledge',
        details: { source: sourceName, type: file ? 'pdf' : 'text', chunks: docs.length }
    });

    console.log("🎉 [SUCCESS] Selesai!");
    return NextResponse.json({ success: true, chunks: docs.length });

  } catch (error) {
    console.error('🔥 [CRITICAL SERVER ERROR]:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}