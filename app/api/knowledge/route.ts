import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export const runtime = 'nodejs';
export const maxDuration = 60; // Maksimalin waktu (Vercel Hobby max 10s-60s)

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GOOGLEAI_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'Server Config Error: GOOGLEAI_API_KEY Missing' }, { status: 500 });
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
        return NextResponse.json({ error: 'Forbidden: Access Denied' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const textInput = formData.get('text') as string | null;
    const titleInput = formData.get('title') as string | null;

    let rawText = "";
    let sourceName = "";

    if (file) {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // --- POLYFILL VERCEL ---
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const globalAny = global as any;
        if (!globalAny.DOMMatrix) globalAny.DOMMatrix = class {};
        if (!globalAny.ImageData) globalAny.ImageData = class {};
        if (!globalAny.Path2D) globalAny.Path2D = class {};
        if (!globalAny.Promise) globalAny.Promise = Promise;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfModule = await import('pdf-parse') as any;
        const pdfParse = pdfModule.default || pdfModule;
        
        const data = await pdfParse(buffer);
        rawText = data.text;
        sourceName = file.name;
    } else if (textInput && titleInput) {
        rawText = `[JUDUL: ${titleInput}]\n${textInput}`; 
        sourceName = `Manual Note: ${titleInput}`;
    } else {
        return NextResponse.json({ error: 'No file or text provided' }, { status: 400 });
    }

    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
    const docs = await splitter.createDocuments([rawText]);

    const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: apiKey, 
        modelName: "embedding-001", 
    });

    // --- OPTIMASI SPEED (BATCH PROCESSING) ---
    // Kita proses embedding secara paralel (max 10 sekaligus biar Google gak marah)
    const batchSize = 10;
    const dataToInsert = [];

    for (let i = 0; i < docs.length; i += batchSize) {
        const batch = docs.slice(i, i + batchSize);
        
        // Proses 1 batch secara paralel
        const batchPromises = batch.map(async (doc) => {
            const vector = await embeddings.embedQuery(doc.pageContent);
            return {
                content: doc.pageContent,
                metadata: { source: sourceName, uploaded_by: user.email },
                embedding: vector
            };
        });

        // Tunggu batch ini kelar
        const batchResults = await Promise.all(batchPromises);
        dataToInsert.push(...batchResults);
    }

    // --- BULK INSERT (SEKALI JALAN) ---
    // Kirim semua data ke Supabase dalam 1 request (Hemat Waktu)
    const { error } = await supabase.from('knowledge').insert(dataToInsert);

    if (error) throw error;

    await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'add_knowledge',
        details: { source: sourceName, type: file ? 'pdf' : 'text', chunks: docs.length }
    });

    return NextResponse.json({ success: true, chunks: docs.length });

  } catch (error) {
    console.error('API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}