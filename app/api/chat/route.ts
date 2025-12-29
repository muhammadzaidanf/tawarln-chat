import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionCreateParamsStreaming } from 'openai/resources/index.mjs';

const client = new OpenAI({
  apiKey: process.env.KOLOSAL_API_KEY,
  baseURL: 'https://api.kolosal.ai/v1',
});

interface GoogleSearchItem {
  title: string;
  link: string;
  snippet: string;
}

// ✅ Tambahin Interface ini buat ngatasin error 'any'
interface MessageContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

async function googleSearch(query: string) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const cx = process.env.GOOGLE_CX_ID;
    
    // Debugging: Cek apakah query yang dicari beneran teks user
    console.log(`[GoogleSearch] Searching for: "${query}"`);

    if (!apiKey || !cx) {
        console.error("[GoogleSearch] Missing API Key or CX ID");
        return null;
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
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

export async function POST(req: Request) {
  try {
    const { messages, model, systemPrompt, temperature, webSearch } = await req.json();

    const selectedModel = model || 'Claude Sonnet 4.5';
    const finalSystemPrompt = systemPrompt || 'Kamu adalah Tawarln, asisten AI yang cerdas, ringkas, dan sangat membantu.';
    const finalTemp = temperature !== undefined ? parseFloat(temperature) : 0.7;

    // --- FIX LOGIC EKSTRAKSI PESAN USER ---
    const lastMessage = messages[messages.length - 1];
    let userQuery = '';

    if (typeof lastMessage.content === 'string') {
        userQuery = lastMessage.content;
    } else if (Array.isArray(lastMessage.content)) {
        // ✅ Ganti 'any' dengan Interface 'MessageContentPart'
        const textPart = lastMessage.content.find((item: MessageContentPart) => item.type === 'text');
        if (textPart && textPart.text) {
            userQuery = textPart.text;
        }
    }
    
    // Fallback kalau kosong
    if (!userQuery) userQuery = "User sent an image/file without text";

    const finalMessages = [...messages];

    if (webSearch) {
      // Pastikan query tidak kosong sebelum search
      if (userQuery && userQuery.length > 2) {
          const searchResults = await googleSearch(userQuery);
          
          if (searchResults) {
            const injectedContent = `
[INFORMASI DARI INTERNET]:
${searchResults}

[INSTRUKSI]:
Gunakan informasi di atas untuk menjawab pertanyaan user di bawah ini. Sertakan link referensi.

[PERTANYAAN USER]:
${userQuery}`;

            // Inject ke pesan terakhir
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
    console.error('[Backend] Critical Error:', error);
    return NextResponse.json({ error: 'Server error bos.' }, { status: 500 });
  }
}