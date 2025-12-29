import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { ChatCompletionCreateParamsStreaming } from 'openai/resources/index.mjs';

// --- KONFIGURASI ---

const client = new OpenAI({
  apiKey: process.env.KOLOSAL_API_KEY,
  baseURL: 'https://api.kolosal.ai/v1',
});

const redis = process.env.UPSTASH_REDIS_REST_URL 
  ? Redis.fromEnv() 
  : null;

const ratelimit = redis 
  ? new Ratelimit({
      redis: redis,
      limiter: Ratelimit.slidingWindow(5, "60 s"), 
      analytics: true,
    })
  : null;

// --- INTERFACES ---
interface GoogleSearchItem {
  title: string;
  link: string;
  snippet: string;
}

interface MessageContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

// --- HELPER FUNCTION: GOOGLE SEARCH ---
async function googleSearch(query: string) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const cx = process.env.GOOGLE_CX_ID;
    
    console.log(`[GoogleSearch] Query: "${query}"`);

    if (!apiKey || !cx) {
        console.error("[GoogleSearch] Missing API Key or CX ID");
        return null;
    }

    const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (data.error) {
        console.error("[GoogleSearch] API Error:", JSON.stringify(data.error, null, 2));
        return null;
    }

    if (!data.items) return null;

    return data.items.slice(0, 3).map((item: GoogleSearchItem) => 
      `Title: ${item.title}\nLink: ${item.link}\nSnippet: ${item.snippet}`
    ).join('\n\n');
  } catch (error) {
    console.error("[GoogleSearch] Exception:", error);
    return null;
  }
}

// --- MAIN HANDLER ---
export async function POST(req: Request) {
  try {
    // ---------------------------------------------------------
    // SECURITY LAYER 1: Server-Side Auth Check
    // ---------------------------------------------------------
    
    // ✅ FIX 1: Pake 'await' karena cookies() itu promise di Next.js terbaru
    const cookieStore = await cookies();
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set(name: string, value: string, options: CookieOptions) { 
            // ✅ FIX 2: Hapus '(error)' di catch karena gak dipake
            try { cookieStore.set({ name, value, ...options }); } catch { 
                // Handle error silently
            }
          },
          remove(name: string, options: CookieOptions) { 
            // ✅ FIX 2: Hapus '(error)' di catch
            try { cookieStore.set({ name, value: '', ...options }); } catch { }
          },
        },
      }
    );

    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: Harap login terlebih dahulu.' }, { status: 401 });
    }

    const userId = session.user.id; 

    // ---------------------------------------------------------
    // SECURITY LAYER 2: Rate Limiting (Upstash)
    // ---------------------------------------------------------
    if (ratelimit) {
      const { success, reset } = await ratelimit.limit(userId);
      
      if (!success) {
        return NextResponse.json(
          { error: 'Terlalu banyak request. Santai dulu bang!' }, 
          { status: 429, headers: { 'Retry-After': reset.toString() } }
        );
      }
    }

    // ---------------------------------------------------------
    // DATA PROCESSING
    // ---------------------------------------------------------
    const { messages, model, systemPrompt, temperature, webSearch } = await req.json();

    const selectedModel = model || 'Claude Sonnet 4.5';
    const finalSystemPrompt = systemPrompt || 'Kamu adalah Tawarln, asisten AI yang cerdas, ringkas, dan sangat membantu.';
    const finalTemp = temperature !== undefined ? parseFloat(temperature) : 0.7;

    const lastMessage = messages[messages.length - 1];
    let userQuery = '';

    if (typeof lastMessage.content === 'string') {
        userQuery = lastMessage.content;
    } else if (Array.isArray(lastMessage.content)) {
        const textPart = lastMessage.content.find((item: MessageContentPart) => item.type === 'text');
        if (textPart && textPart.text) {
            userQuery = textPart.text;
        }
    }
    
    if (!userQuery) userQuery = "User sent an image/file without text";

    // ---------------------------------------------------------
    // SECURITY LAYER 3: Input Validation
    // ---------------------------------------------------------
    if (userQuery.length > 2000) {
        return NextResponse.json({ error: 'Pesan terlalu panjang (Max 2000 karakter).' }, { status: 400 });
    }

    // ---------------------------------------------------------
    // SEARCH & INJECTION LOGIC
    // ---------------------------------------------------------
    const finalMessages = [...messages];

    if (webSearch) {
      if (userQuery && userQuery.length > 2) {
          const searchResults = await googleSearch(userQuery);
          
          if (searchResults) {
            const injectedContent = `
[INFORMASI DARI INTERNET]:
${searchResults}

[INSTRUKSI]:
Gunakan informasi di atas untuk menjawab pertanyaan user di bawah ini. Sertakan link referensi jika ada.

[PERTANYAAN USER]:
${userQuery}`;

            finalMessages[finalMessages.length - 1] = {
                role: lastMessage.role,
                content: injectedContent
            };
          }
      }
    }

    // ---------------------------------------------------------
    // OPENAI STREAMING
    // ---------------------------------------------------------
    const body: ChatCompletionCreateParamsStreaming & Record<string, unknown> = {
      model: selectedModel,
      messages: [
        { role: 'system', content: finalSystemPrompt },
        ...finalMessages 
      ],
      temperature: finalTemp,
      max_tokens: 2048,
      stream: true,
    };

    const response = await client.chat.completions.create(body);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of response) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  } catch (error) {
    console.error('[Backend] Critical Error:', error);
    return NextResponse.json({ error: 'Server error bos.' }, { status: 500 });
  }
}