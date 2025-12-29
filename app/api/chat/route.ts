import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import * as cheerio from 'cheerio';
import type { ChatCompletionCreateParamsStreaming, ChatCompletionMessageParam } from 'openai/resources/index.mjs';

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
      limiter: Ratelimit.slidingWindow(10, "60 s"), 
      analytics: true,
    })
  : null;

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

async function googleSearch(query: string) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const cx = process.env.GOOGLE_CX_ID;
    
    if (!apiKey || !cx) return null;

    const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (data.error || !data.items) return null;

    return data.items.slice(0, 4).map((item: GoogleSearchItem) => 
      `Title: ${item.title}\nLink: ${item.link}\nSnippet: ${item.snippet}`
    ).join('\n\n');
  } catch {
    return null;
  }
}

async function scrapeUrl(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    $('script').remove();
    $('style').remove();
    $('nav').remove();
    $('footer').remove();
    $('iframe').remove();
    $('.ads').remove();

    const text = $('body').text().replace(/\s+/g, ' ').trim();
    return text.slice(0, 6000); 
  } catch {
    return null;
  }
}

async function generateSearchKeyword(messages: ChatCompletionMessageParam[], model: string) {
    try {
        const recentMessages = messages.slice(-3);
        const response = await client.chat.completions.create({
            model: model,
            messages: [
                { role: "system", content: "You are a Search Query Generator. Read the conversation history and the user's last request. Output ONLY a concise Google Search keyword that best fits the user's intent. Do not output anything else." },
                ...recentMessages
            ],
            temperature: 0.3,
            max_tokens: 30,
        });

        const keyword = response.choices[0]?.message?.content?.trim();
        return keyword || null;
    } catch {
        return null;
    }
}

export async function POST(req: Request) {
  try {
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!sbUrl || !sbKey) {
        return NextResponse.json({ error: 'Server Config Error' }, { status: 500 });
    }

    const cookieStore = await cookies();
    
    const supabase = createServerClient(
      sbUrl,
      sbKey,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set(name: string, value: string, options: CookieOptions) { 
            try { cookieStore.set({ name, value, ...options }); } catch { }
          },
          remove(name: string, options: CookieOptions) { 
            try { cookieStore.set({ name, value: '', ...options }); } catch { }
          },
        },
      }
    );

    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id; 
    let userMemory = '';

    try {
        const { data: profile } = await supabase
            .from('profiles')
            .select('bio')
            .eq('id', userId)
            .single();
        
        if (profile?.bio) {
            userMemory = profile.bio;
        }
    } catch { }

    if (ratelimit) {
      const { success, reset } = await ratelimit.limit(userId);
      if (!success) {
        return NextResponse.json(
          { error: 'Too many requests' }, 
          { status: 429, headers: { 'Retry-After': reset.toString() } }
        );
      }
    }

    const { messages, model, systemPrompt, temperature, webSearch } = await req.json();

    const selectedModel = model || 'Claude Sonnet 4.5';
    let finalSystemPrompt = systemPrompt || 'Kamu adalah Tawarln, asisten AI yang cerdas, ringkas, dan sangat membantu.';
    const finalTemp = temperature !== undefined ? parseFloat(temperature) : 0.7;

    if (userMemory) {
        finalSystemPrompt += `\n\n[INGATAN TENTANG USER]:\n${userMemory}\n(Gunakan informasi ini untuk mempersonalisasi jawaban).`;
    }

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

    if (userQuery.length > 2000) {
        return NextResponse.json({ error: 'Message too long' }, { status: 400 });
    }

    const finalMessages = [...messages];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = userQuery.match(urlRegex);

    if (urls && urls.length > 0) {
        const targetUrl = urls[0];
        const scrapedContent = await scrapeUrl(targetUrl);

        if (scrapedContent) {
            const injectedContent = `
[ISI WEBSITE DARI LINK USER (${targetUrl})]:
${scrapedContent}

[INSTRUKSI]:
User mengirimkan link. Gunakan ISI WEBSITE di atas untuk menjawab pertanyaan user. Jangan halusinasi.

[PERTANYAAN USER]:
${userQuery}`;

            finalMessages[finalMessages.length - 1] = {
                role: lastMessage.role,
                content: injectedContent
            };
        }
    } else if (webSearch) {
        const optimizedKeyword = await generateSearchKeyword(messages, selectedModel);
        const finalSearchQuery = optimizedKeyword || userQuery;

        if (finalSearchQuery && finalSearchQuery.length > 1) {
             const searchResults = await googleSearch(finalSearchQuery);
          
             if (searchResults) {
                const injectedContent = `
[HASIL PENCARIAN GOOGLE (Keyword: "${finalSearchQuery}")]:
${searchResults}

[INSTRUKSI]:
Gunakan informasi di atas untuk menjawab pertanyaan user. Sertakan link referensi jika ada.

[PERTANYAAN USER]:
${userQuery}`;

                finalMessages[finalMessages.length - 1] = {
                    role: lastMessage.role,
                    content: injectedContent
                };
             }
        }
    }

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
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}