'use client';

// 1. Import useParams dari next/navigation
import { useParams } from 'next/navigation'; 
import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient'; 
import ReactMarkdown from 'react-markdown';
import { Bot, User, AlertTriangle } from 'lucide-react';

// --- TIPE DATA ---
type VisionItem = {
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
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
    is_shared: boolean;
}

export default function SharedChat() {
    // 2. AMBIL ID DARI URL PAKE HOOK (Jurus Anti Gagal)
    const params = useParams();
    const id = params?.id as string; // Pastikan jadi string

    const [chat, setChat] = useState<SharedChatData | null>(null);
    const [loading, setLoading] = useState(true);
    const [debugError, setDebugError] = useState<string | null>(null);

    useEffect(() => {
        // Kalau ID belum siap, jangan jalan dulu
        if (!id) return;

        const fetchChat = async () => {
            console.log("Mencari ID:", id);
            
            // Pake .maybeSingle() biar gak error system
            const { data, error } = await supabase
                .from('chats')
                .select('*')
                .eq('id', id)
                .maybeSingle(); 

            if (error) {
                console.error("Supabase Error:", error);
                setDebugError(error.message);
            } else if (!data) {
                setDebugError("Chat TIDAK DITEMUKAN di Database. ID mungkin salah.");
            } else {
                const chatData = data as SharedChatData;
                
                // Cek status is_shared
                if (!chatData.is_shared) {
                    setDebugError("Chat ADA, tapi status 'is_shared' masih FALSE (Private).");
                } else {
                    setChat(chatData);
                }
            }
            setLoading(false);
        };

        fetchChat();
    }, [id]);

    if (loading) return (
        <div className="flex h-screen items-center justify-center bg-white dark:bg-[#09090b] text-zinc-500">
            <div className="animate-pulse flex flex-col items-center">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                Loading ID: {id || '...'}
            </div>
        </div>
    );

    // --- TAMPILAN ERROR (DEBUG) ---
    if (!chat) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-white dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100">
                <div className="bg-red-500/10 text-red-500 p-4 rounded-full mb-4">
                    <AlertTriangle size={32} />
                </div>
                <h2 className="text-xl font-bold mb-2">Gagal Memuat Chat</h2>
                
                {/* KOTAK DEBUG */}
                <div className="bg-zinc-100 dark:bg-zinc-900 p-4 rounded-lg max-w-md w-full text-left font-mono text-xs border border-zinc-200 dark:border-zinc-800">
                    <p className="font-bold text-zinc-400 mb-2 border-b pb-1">DEBUG INFO:</p>
                    <p>URL ID: <span className="text-blue-500">{id || "UNDEFINED (Gak Kebaca)"}</span></p>
                    <p>Status: <span className="text-red-500">{debugError}</span></p>
                </div>
            </div>
        );
    }

    // --- TAMPILAN CHAT SUKSES ---
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