import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Init client
const client = new OpenAI({
  apiKey: process.env.KOLOSAL_API_KEY,
  baseURL: 'https://api.kolosal.ai/v1',
});

export async function POST(req: Request) {
  try {
    const { messages, model, systemPrompt, temperature } = await req.json();

    const selectedModel = model || 'Claude Sonnet 4.5';
    const defaultSystem = 'Kamu adalah Tawarln, asisten AI yang cerdas, ringkas, dan sangat membantu.';
    const finalSystemPrompt = systemPrompt || defaultSystem;
    const finalTemp = temperature !== undefined ? parseFloat(temperature) : 0.7;

    // 1. Request ke API dengan stream: true
    const response = await client.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: finalSystemPrompt },
        ...messages
      ],
      temperature: finalTemp,
      max_tokens: 2048,
      stream: true, // INI KUNCINYA
    });

    // 2. Bikin ReadableStream buat dikirim ke Frontend
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

    // 3. Return stream response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Server error bos.' }, { status: 500 });
  }
}