'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient'; 
import ReactMarkdown from 'react-markdown';
import { Bot, User } from 'lucide-react';

// --- DEFINISI TIPE DATA (Strict Type) ---
// ✅ FIX: Ganti 'any' dengan struktur object asli
type VisionItem = {
    type: string;
    text?: string;
    image_url?: {
        url: string;
    };
};

type MessageContent = string | VisionItem[];

interface Message {
    role: 'user' | 'assistant';
    content: MessageContent;
}

interface SharedChatData {
    id: string;
    title: string;
    messages: Message[];
    created_at?: string;
}

export default function SharedChat({ params }: { params: { id: string } }) {
    const [chat, setChat] = useState<SharedChatData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchChat = async () => {
            const { data } = await supabase
                .from('chats')
                .select('*')
                .eq('id', params.id)
                .eq('is_shared', true) 
                .single();
            
            if (data) {
                // Casting data aman karena kita udah definisikan tipe di atas
                setChat(data as SharedChatData);
            }
            setLoading(false);
        };
        fetchChat();
    }, [params.id]);

    if (loading) return <div className="p-10 text-center animate-pulse text-zinc-500">Loading shared chat...</div>;
    if (!chat) return <div className="p-10 text-center text-red-500">Chat not found or private.</div>;

    return (
        <div className="max-w-3xl mx-auto p-6 font-sans min-h-screen bg-white dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100">
            <h1 className="text-2xl font-bold mb-8 border-b border-zinc-200 dark:border-zinc-800 pb-4">{chat.title}</h1>
            
            <div className="space-y-6">
                {chat.messages.map((msg: Message, i: number) => (
                    <div key={i} className="flex gap-4">
                         <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'assistant' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'}`}>
                            {msg.role === 'assistant' ? <Bot size={16}/> : <User size={16}/>}
                        </div>
                        <div className="prose dark:prose-invert max-w-none text-sm md:text-base leading-7">
                            <ReactMarkdown>
                                {typeof msg.content === 'string' 
                                    ? msg.content 
                                    : '📷 [Image/File Content Hidden in Preview]' 
                                }
                            </ReactMarkdown>
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="mt-14 pt-6 border-t border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-500">
                Shared via <span className="font-semibold text-blue-500">Tawarln AI</span>
            </div>
        </div>
    );
}