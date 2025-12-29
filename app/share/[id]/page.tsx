'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient'; 
import ReactMarkdown from 'react-markdown';
import { Bot, User, AlertTriangle } from 'lucide-react';

// --- TIPE DATA STRICT (NO ANY) ---
type VisionItem = {
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
};

// Content bisa berupa String biasa atau Array Vision (Gambar+Text)
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

export default function SharedChat({ params }: { params: { id: string } }) {
    const [chat, setChat] = useState<SharedChatData | null>(null);
    const [loading, setLoading] = useState(true);
    const [debugError, setDebugError] = useState<string | null>(null);

    useEffect(() => {
        const fetchChat = async () => {
            console.log("Mencari ID:", params.id);
            
            // Menggunakan .maybeSingle() agar tidak error jika data kosong
            const { data, error } = await supabase
                .from('chats')
                .select('*')
                .eq('id', params.id)
                .maybeSingle(); 

            if (error) {
                console.error("Supabase Error:", error);
                setDebugError(error.message);
            } else if (!data) {
                // Jika data null, berarti ID tidak ditemukan di database
                setDebugError("Chat HILANG / BELUM DISYNC ke Database. Pastikan ID benar atau coba buat chat baru.");
            } else {
                // Data ditemukan, casting ke tipe data kita
                const chatData = data as SharedChatData;

                // Cek status is_shared
                if (!chatData.is_shared) {
                    setDebugError("Chat ADA, tapi status 'is_shared' masih FALSE (Private). Minta pemilik chat untuk membagikan ulang.");
                } else {
                    setChat(chatData);
                }
            }
            setLoading(false);
        };
        fetchChat();
    }, [params.id]);

    if (loading) return <div className="p-10 text-center animate-pulse text-zinc-500">Lagi nyari data...</div>;

    // TAMPILAN ERROR JIKA ADA (DEBUG MODE)
    if (!chat) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-white dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100">
                <div className="bg-red-500/10 text-red-500 p-4 rounded-full mb-4">
                    <AlertTriangle size={32} />
                </div>
                <h2 className="text-xl font-bold mb-2">Gagal Memuat Chat</h2>
                <p className="text-zinc-500 mb-6">Ada masalah saat mengambil data.</p>
                
                {/* KOTAK ERROR DIAGNOSA */}
                <div className="bg-zinc-100 dark:bg-zinc-900 p-4 rounded-lg max-w-md w-full text-left font-mono text-xs border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
                    <p className="font-bold text-zinc-400 mb-2 border-b pb-1">DEBUG INFO:</p>
                    <p className="mb-1">ID URL: <span className="text-blue-500">{params.id}</span></p>
                    <p>Status: <span className="text-red-500 font-bold">{debugError || "Unknown Error"}</span></p>
                </div>
            </div>
        );
    }

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