'use client';

import { useState, useRef, useEffect, ComponentPropsWithoutRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import TextareaAutosize from 'react-textarea-autosize';
import { 
  Send, Trash2, Copy, Check, Bot, User as UserIcon,
  Terminal, Sparkles, Coffee, BookOpen, 
  Menu, Plus, MessageSquare, ChevronDown, CheckCircle2,
  X, FileCode, Pencil, MoreHorizontal, Edit2, Settings, Sliders, StopCircle, Cloud, LogOut, ShieldCheck, Sun, Moon, AlertTriangle
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { supabase } from './supabaseClient';
import { User } from '@supabase/supabase-js';

// --- DAFTAR MODEL ---
const MODELS = [
  { id: 'Claude Sonnet 4.5', name: 'Claude 3.5 Sonnet', desc: 'Best for Vision & Code' },
  { id: 'GLM 4.6', name: 'GLM 4.6', desc: 'Balanced' },
  { id: 'Kimi K2', name: 'Kimi K2', desc: 'Creative' },
  { id: 'Llama 4 Maverick', name: 'Llama 4', desc: 'Fastest' },
  { id: 'MiniMax M2', name: 'MiniMax M2', desc: 'General Purpose' },
  { id: 'Qwen 3 30BA3B', name: 'Qwen 3', desc: 'Smart Logic' },
];

// --- TIPE DATA ---
type VisionItem = { type: 'text' | 'image_url'; text?: string; image_url?: { url: string } };
type VisionContent = Array<VisionItem>;
type MessageContent = string | VisionContent;

type Message = { role: 'user' | 'assistant'; content: MessageContent; };

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  model: string;
};

interface ChatPayload {
  messages: { role: string; content: MessageContent }[];
  model: string;
  systemPrompt: string;
  temperature: number;
}

type DatabaseChat = {
  id: string;
  user_id: string;
  title: string;
  messages: Message[]; 
  created_at: number;
  model: string | null;
};

// --- KOMPONEN CODE BLOCK ---
interface CodeProps extends ComponentPropsWithoutRef<'code'> { inline?: boolean; }
const CodeBlock = ({ inline, className, children, ...props }: CodeProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : 'text';

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setIsCopied(true);
    toast.success('Code copied!');
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (inline) return <code className="bg-black/10 dark:bg-white/10 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>;

  return (
    <div className="relative my-4 rounded-xl overflow-hidden border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#1e1e1e] shadow-sm dark:shadow-2xl group">
      <div className="flex justify-between items-center bg-gray-100 dark:bg-white/5 px-4 py-2 text-xs text-gray-500 dark:text-gray-400 select-none border-b border-gray-200 dark:border-white/5">
        <span className="uppercase font-semibold tracking-wider font-mono text-blue-500 dark:text-blue-400">{language}</span>
        <button onClick={handleCopy} className="flex items-center gap-1.5 hover:text-black dark:hover:text-white transition-colors">
          {isCopied ? <Check size={14} className="text-green-500 dark:text-green-400" /> : <Copy size={14} />}
          <span>{isCopied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <code className={`!bg-transparent ${className}`} {...props}>{children}</code>
      </div>
    </div>
  );
};

const SUGGESTIONS = [
  { icon: <Terminal size={18} />, text: "Buatin script Python buat login", label: "Coding" },
  { icon: <Sparkles size={18} />, text: "Analisa gambar yang gw upload", label: "Vision" },
  { icon: <BookOpen size={18} />, text: "Jelaskan isi file code ini", label: "File Analysis" },
  { icon: <Coffee size={18} />, text: "Resep masakan dari bahan sisa", label: "Lifestyle" },
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null); 
  const [authLoading, setAuthLoading] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // UI STATES
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); // NEW STATE UTK MODAL DELETE
  const [chatToDelete, setChatToDelete] = useState<string | null>(null); // NEW STATE UTK ID YG MAU DIHAPUS
  
  // SETTINGS
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);

  const [attachment, setAttachment] = useState<{ url: string; type: 'image' | 'file'; name: string } | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentMessages = useMemo(() => {
    return sessions.find(s => s.id === currentSessionId)?.messages || [];
  }, [sessions, currentSessionId]);

  // --- AUTH & THEME ---
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setAuthLoading(false);
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    const savedTheme = localStorage.getItem('tawarln_theme');
    if (savedTheme === 'light') setTheme('light');

    return () => subscription.unsubscribe();
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('tawarln_theme', newTheme);
  };

  // --- DB HELPERS ---
  const syncSessionToDb = useCallback(async (session: ChatSession) => {
    if (!user) return;
    const { error } = await supabase.from('chats').upsert({ 
        id: session.id, user_id: user.id, title: session.title, 
        messages: session.messages as unknown, created_at: session.createdAt, model: session.model 
      });
    if (error) console.error('Gagal sync ke DB:', error);
  }, [user]);

  const deleteSessionFromDb = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from('chats').delete().eq('id', id);
    if (error) console.error('Gagal hapus dari DB:', error);
  }, [user]);

  // --- MODEL & CHAT SYNC FIX ---
  // FIX: Kita HAPUS useEffect yang maksa selectedModel ngikutin session terus menerus.
  // Gantinya: Kita update selectedModel HANYA saat ganti chat (pindah ID).
  useEffect(() => {
    if (currentSessionId) {
        const sess = sessions.find(s => s.id === currentSessionId);
        if (sess && sess.model) {
            setSelectedModel(sess.model);
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]); // Cuma jalan kalau GANTI CHAT ID, bukan tiap ngetik

  const createNewChat = useCallback(() => {
    if (!user) return;
    const newId = Date.now().toString();
    // Gunakan selectedModel yang sedang aktif untuk chat baru
    const newSession: ChatSession = { id: newId, title: 'New Chat', messages: [], createdAt: Date.now(), model: selectedModel };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setIsSidebarOpen(false);
    setAttachment(null);
    syncSessionToDb(newSession);
  }, [selectedModel, user, syncSessionToDb]);

  useEffect(() => {
    if (!user) return;
    const fetchChats = async () => {
      setIsSyncing(true);
      const { data, error } = await supabase.from('chats').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        const loadedSessions: ChatSession[] = (data as DatabaseChat[]).map((row) => ({
          id: row.id, title: row.title, messages: row.messages, createdAt: row.created_at, model: row.model || MODELS[0].id
        }));
        setSessions(loadedSessions);
        if (loadedSessions.length > 0) setCurrentSessionId(loadedSessions[0].id);
        else createNewChat(); // Kalau kosong bikin baru
      } else { createNewChat(); }
      setIsSyncing(false);
    };
    fetchChats();
    
    const savedSettings = localStorage.getItem('tawarln_settings');
    if (savedSettings) {
        try {
            const parsed = JSON.parse(savedSettings);
            if(parsed.systemPrompt) setSystemPrompt(parsed.systemPrompt);
            if(parsed.temperature) setTemperature(parsed.temperature);
        } catch {}
    }
  }, [user, createNewChat]);

  useEffect(() => { localStorage.setItem('tawarln_settings', JSON.stringify({ systemPrompt, temperature })); }, [systemPrompt, temperature]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [currentMessages, attachment]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return; }
    const reader = new FileReader();
    reader.onloadend = () => setAttachment({ url: reader.result as string, type: file.type.startsWith('image/') ? 'image' : 'file', name: file.name });
    if (file.type.startsWith('image/')) reader.readAsDataURL(file); else reader.readAsText(file);
  };

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: window.location.origin }
    });
    if (error) toast.error(error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSessions([]); setCurrentSessionId(null);
    toast.success("Logged out");
  };

  // --- MODAL DELETE LOGIC ---
  const confirmDeleteChat = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setChatToDelete(id); // Simpen ID yang mau dihapus
      setIsDeleteModalOpen(true); // Buka Modal
      setActiveMenuId(null); // Tutup menu titik tiga
  };

  const executeDeleteChat = async () => {
      if (!chatToDelete) return;
      const newSess = sessions.filter(s => s.id !== chatToDelete);
      setSessions(newSess);
      await deleteSessionFromDb(chatToDelete);
      
      if (currentSessionId === chatToDelete) {
        if (newSess.length > 0) setCurrentSessionId(newSess[0].id);
        else createNewChat();
      }
      setIsDeleteModalOpen(false); // Tutup Modal
      setChatToDelete(null);
      toast.success("Chat deleted");
  };

  const startRename = (e: React.MouseEvent, session: ChatSession) => {
    setEditingSessionId(session.id);
    setEditTitle(session.title);
    setActiveMenuId(null);
  };

  const saveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSessionId) {
      setSessions(prev => prev.map(s => {
        if (s.id === editingSessionId) {
            const updated = { ...s, title: editTitle };
            syncSessionToDb(updated);
            return updated;
        } 
        return s;
      }));
      setEditingSessionId(null);
    }
  };

  const copyMessage = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copied'); };
  const startEditMessage = (index: number, content: MessageContent) => {
    if (typeof content === 'string') { setEditingMessageIndex(index); setEditingMessageText(content); }
    else { toast.error('Cannot edit image messages'); }
  };

  const handleStreamingResponse = async (payload: ChatPayload, sessionId: string) => {
    setLoading(true);
    abortControllerRef.current = new AbortController();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: abortControllerRef.current.signal
      });
      if (!res.ok || !res.body) throw new Error(res.statusText);
      const initialBotMsg: Message = { role: 'assistant', content: '' };
      setSessions(prev => {
          return prev.map(s => s.id === sessionId ? { ...s, messages: [...s.messages, initialBotMsg] } : s);
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let streamedText = '';
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value, { stream: true });
        streamedText += chunkValue;
        setSessions(prev => prev.map(s => {
            if (s.id === sessionId) {
                const newMsgs = [...s.messages];
                const lastMsgIndex = newMsgs.length - 1;
                newMsgs[lastMsgIndex] = { ...newMsgs[lastMsgIndex], content: streamedText };
                return { ...s, messages: newMsgs };
            }
            return s;
        }));
      }
      setSessions(prev => {
          const session = prev.find(s => s.id === sessionId);
          if (session) syncSessionToDb(session);
          return prev;
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') toast.info('Stopped.');
      else toast.error('Error generating response.');
    } finally { setLoading(false); abortControllerRef.current = null; }
  };

  const saveEditAndRegenerate = async () => {
    if (!currentSessionId || editingMessageIndex === null) return;
    const currentHist = sessions.find(s => s.id === currentSessionId)?.messages || [];
    const keptMessages = currentHist.slice(0, editingMessageIndex);
    const newUserMsg: Message = { role: 'user', content: editingMessageText };
    const newMessages = [...keptMessages, newUserMsg];
    setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: newMessages } : s));
    setEditingMessageIndex(null);
    const apiPayload: ChatPayload = { messages: newMessages.map(m => ({ role: m.role, content: m.content })), model: selectedModel, systemPrompt, temperature };
    await handleStreamingResponse(apiPayload, currentSessionId);
  };

  const sendMessage = async (text: string) => {
    if ((!text.trim() && !attachment) || loading || !currentSessionId) return;
    let userContent: MessageContent = text;
    let apiContent: VisionContent = [];
    if (attachment) {
      if (attachment.type === 'image') {
        const visionPayload: VisionContent = [{ type: 'text', text: text || "Analyze this image" }, { type: 'image_url', image_url: { url: attachment.url } }];
        userContent = visionPayload; apiContent = visionPayload; 
      } else {
        const combinedText = `[File: ${attachment.name}]\n\`\`\`\n${attachment.url}\n\`\`\`\n\n${text}`;
        userContent = combinedText; apiContent = [{ type: 'text', text: combinedText }];
      }
    } else { apiContent = [{ type: 'text', text }]; }
    const userMsg: Message = { role: 'user', content: userContent };
    
    // UPDATE SESI + MODEL TERPILIH
    setSessions(prev => {
        return prev.map(session => {
            if (session.id === currentSessionId) {
                const newTitle = session.messages.length === 0 ? (typeof userContent === 'string' ? userContent.slice(0,30) : 'Image Analysis') : session.title;
                // KUNCI: Kita simpan model yang dipilih user ke dalam sesi
                const updatedSession = { ...session, title: newTitle, messages: [...session.messages, userMsg], model: selectedModel };
                syncSessionToDb(updatedSession);
                return updatedSession;
            }
            return session;
        });
    });
    setInput(''); setAttachment(null); if(fileInputRef.current) fileInputRef.current.value = ''; 
    const currentHist = sessions.find(s => s.id === currentSessionId)?.messages || [];
    const payload = [...currentHist.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: apiContent }];
    const apiPayload: ChatPayload = { messages: payload, model: selectedModel, systemPrompt, temperature };
    await handleStreamingResponse(apiPayload, currentSessionId);
  };

  const handleStop = () => { if(abortControllerRef.current) abortControllerRef.current.abort(); };
  const renderMessageContent = (content: MessageContent) => {
    if (typeof content === 'string') return <ReactMarkdown components={{ code: CodeBlock }}>{content}</ReactMarkdown>;
    return (
      <div className="flex flex-col gap-2">
        {content.map((part, i) => {
          if (part.type === 'image_url') {
             // eslint-disable-next-line @next/next/no-img-element
             return <img key={i} src={part.image_url?.url} alt="Uploaded" className="max-w-full md:max-w-md rounded-lg mb-2 border border-white/10" />;
          }
          if (part.type === 'text') return <ReactMarkdown key={i} components={{ code: CodeBlock }}>{part.text || ''}</ReactMarkdown>;
          return null;
        })}
      </div>
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const closeAllMenus = () => { setActiveMenuId(null); setIsModelMenuOpen(false); setIsProfileMenuOpen(false); setIsDeleteModalOpen(false); };
  const toggleMenu = (id: string) => { setActiveMenuId(activeMenuId === id ? null : id); };

  if (authLoading) return <div className={`flex h-screen items-center justify-center ${theme === 'dark' ? 'bg-[#09090b] text-white' : 'bg-white text-black'}`}>Loading...</div>;

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#09090b] text-white p-4">
        <div className="w-full max-w-md bg-[#1e1e1e] border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center shadow-lg border border-white/10 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to Tawarln</h1>
          <p className="text-gray-400 mb-8 text-sm">Sign in to sync your history across devices.</p>
          <button onClick={handleLogin} className="w-full flex items-center justify-center gap-3 bg-white text-black font-semibold py-3 rounded-xl hover:bg-gray-200 transition-all active:scale-95">
            <ShieldCheck size={20} /> Continue with Google
          </button>
          <p className="mt-6 text-xs text-gray-500">Secure authentication powered by Supabase.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-[100dvh] font-sans overflow-hidden ${theme === 'dark' ? 'bg-[#09090b] text-gray-100' : 'bg-white text-gray-900'}`}>
      <Toaster position="top-center" theme={theme} />
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} accept="image/*,.txt,.js,.py,.ts,.json,.md,.html,.css" />

      {(activeMenuId || isModelMenuOpen || isProfileMenuOpen || isDeleteModalOpen) && <div className="fixed inset-0 z-[25]" onClick={closeAllMenus} />}

      {/* --- NEW CUSTOM DELETE MODAL --- */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
            <div className={`border rounded-2xl w-full max-w-sm p-6 shadow-2xl relative scale-100 ${theme === 'dark' ? 'bg-[#1e1e1e] border-white/10' : 'bg-white border-gray-200'}`}>
                <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-500">
                        <AlertTriangle size={24} />
                    </div>
                    <h3 className="text-lg font-bold mb-1">Delete Chat?</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">This action cannot be undone. The chat history will be permanently removed.</p>
                    <div className="flex gap-3 w-full">
                        <button onClick={() => setIsDeleteModalOpen(false)} className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition-colors ${theme === 'dark' ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'}`}>Cancel</button>
                        <button onClick={executeDeleteChat} className="flex-1 py-2.5 rounded-xl font-medium text-sm bg-red-600 hover:bg-red-700 text-white transition-colors">Delete</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
            <div className={`border rounded-2xl w-full max-w-md p-6 shadow-2xl relative ${theme === 'dark' ? 'bg-[#1e1e1e] border-white/10' : 'bg-white border-gray-200'}`}>
                <button onClick={() => setIsSettingsOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500"><X size={20} /></button>
                <h2 className="text-xl font-bold mb-1 flex items-center gap-2"><Sliders size={20} className="text-blue-500"/> Settings</h2>
                <p className="text-gray-500 text-sm mb-6">Customize Tawarln&apos;s personality</p>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">System Instructions</label>
                        <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className={`w-full h-32 border rounded-xl p-3 text-sm focus:ring-1 focus:ring-blue-500 outline-none resize-none ${theme === 'dark' ? 'bg-black/50 border-white/10 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-900'}`} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2 flex justify-between"><span>Creativity</span><span className="text-blue-500 font-mono">{temperature}</span></label>
                        <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                    </div>
                </div>
                <button onClick={() => setIsSettingsOpen(false)} className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl transition-colors">Save Changes</button>
            </div>
        </div>
      )}

      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-[260px] border-r transform transition-transform duration-300 md:relative md:translate-x-0 ${theme === 'dark' ? 'bg-black border-white/10' : 'bg-[#f8fafc] border-gray-200'} ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full p-3">
          
          <div className="flex items-center gap-3 px-2 mb-6 mt-2">
             {/* eslint-disable-next-line @next/next/no-img-element */}
             <img src="/logo.png" alt="Tawarln Logo" className="w-8 h-8 object-contain" /> 
             <span className={`text-xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Tawarln</span>
          </div>

          <button onClick={createNewChat} className={`flex items-center justify-between w-full px-3 py-3 mb-4 rounded-lg border transition-colors text-sm font-medium group ${theme === 'dark' ? 'border-white/10 hover:bg-white/5 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm'}`}>
            <div className="flex items-center gap-3"><div className="p-1 bg-black text-white dark:bg-white dark:text-black rounded-md"><Plus size={16} /></div>New Chat</div><MessageSquare size={16} className="text-gray-400" />
          </button>
          
          <div className="px-3 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center">
            <span>History</span>
            {isSyncing && <Cloud size={12} className="text-blue-500 animate-pulse"/>}
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
            {sessions.map((s) => (
              <div key={s.id} className={`group flex items-center justify-between w-full rounded-lg text-sm cursor-pointer relative ${currentSessionId === s.id ? (theme === 'dark' ? 'bg-white/10 text-white' : 'bg-white shadow-sm text-gray-900') : 'text-gray-500 hover:bg-black/5 dark:hover:bg-white/5'}`}>
                <div className="flex-1 truncate py-3 pl-3 pr-2" onClick={() => { if(editingSessionId !== s.id) { setCurrentSessionId(s.id); setIsSidebarOpen(false); }}}>
                  {editingSessionId === s.id ? (
                    <form onSubmit={saveRename} onClick={e => e.stopPropagation()} className="flex items-center gap-2 w-full z-20">
                       <input autoFocus value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onBlur={() => setEditingSessionId(null)} className="bg-transparent border border-blue-500 rounded px-1.5 py-0.5 w-full text-xs outline-none" />
                    </form>
                  ) : <span>{s.title}</span>}
                </div>
                {!editingSessionId && (
                    <div className="relative h-full flex items-center pr-2 z-[30]">
                        <button onClick={(e) => { e.stopPropagation(); toggleMenu(s.id); }} className={`p-1.5 rounded-md transition-all ${activeMenuId === s.id ? 'opacity-100' : 'opacity-100 md:opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-white/10'}`}><MoreHorizontal size={16} /></button>
                        {activeMenuId === s.id && (
                            <div className={`absolute right-0 top-8 w-32 border rounded-lg shadow-xl overflow-hidden flex flex-col py-1 ${theme === 'dark' ? 'bg-[#2d2d2d] border-white/10' : 'bg-white border-gray-200'}`}>
                                <button onClick={(e) => { e.stopPropagation(); startRename(e, s); }} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-black/5 dark:hover:bg-white/5 w-full text-left"><Pencil size={12} /> Rename</button>
                                {/* PAKE CONFIRM DELETE CUSTOM */}
                                <button onClick={(e) => confirmDeleteChat(e, s.id)} className="flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-500/10 w-full text-left"><Trash2 size={12} /> Delete</button>
                            </div>
                        )}
                    </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>
      {isSidebarOpen && <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setIsSidebarOpen(false)}/>}

      <main className="flex-1 flex flex-col relative w-full transition-colors duration-300">
        <header className={`flex items-center justify-between p-3 sticky top-0 backdrop-blur z-[30] md:p-4 border-b ${theme === 'dark' ? 'bg-[#09090b]/90 border-white/5' : 'bg-white/90 border-gray-200'}`}>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-gray-500 p-2"><Menu size={24} /></button>
            <div className="relative z-[30]"> 
              <button onClick={(e) => { e.stopPropagation(); setIsModelMenuOpen(!isModelMenuOpen); }} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-lg font-semibold transition-colors ${theme === 'dark' ? 'hover:bg-white/10 text-gray-200' : 'hover:bg-gray-100 text-gray-800'}`}>
                <span className="bg-gradient-to-r from-blue-500 to-cyan-500 text-transparent bg-clip-text">{MODELS.find(m => m.id === selectedModel)?.name}</span>
                <ChevronDown size={16} className={`text-gray-500 transition-transform ${isModelMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {isModelMenuOpen && (
                <div className={`absolute top-full left-0 mt-2 w-[280px] border rounded-xl shadow-2xl p-1.5 flex flex-col gap-1 ${theme === 'dark' ? 'bg-[#1e1e1e] border-white/10' : 'bg-white border-gray-200'}`}>
                    {MODELS.map((m) => (
                      <button key={m.id} onClick={() => { setSelectedModel(m.id); setIsModelMenuOpen(false); }} className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-left ${selectedModel === m.id ? 'bg-blue-600 text-white' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}>
                        <div><div className="font-medium text-sm">{m.name}</div><div className={`text-xs ${selectedModel === m.id ? 'text-blue-100' : 'text-gray-500'}`}>{m.desc}</div></div>
                        {selectedModel === m.id && <CheckCircle2 size={16} />}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="relative z-[30]">
            <button onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)} className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm hover:scale-105 transition-transform shadow-md">
              {user?.email?.slice(0,2).toUpperCase()}
            </button>
            
            {isProfileMenuOpen && (
                <div className={`absolute right-0 top-full mt-3 w-56 border rounded-xl shadow-2xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 ${theme === 'dark' ? 'bg-[#1e1e1e] border-white/10' : 'bg-white border-gray-200'}`}>
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-white/5">
                        <div className="text-sm font-semibold">{user?.email?.split('@')[0]}</div>
                        <div className="text-xs text-gray-500 truncate">{user?.email}</div>
                    </div>
                    <button onClick={() => { setIsSettingsOpen(true); setIsProfileMenuOpen(false); }} className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        <Settings size={16} /> Settings
                    </button>
                    <button onClick={toggleTheme} className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} 
                        {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    </button>
                    <div className="h-[1px] bg-gray-200 dark:bg-white/5 my-1"></div>
                    <button onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <LogOut size={16} /> Log Out
                    </button>
                </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-[800px] mx-auto px-4 pb-40 pt-4 md:pt-8">
            {currentMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ring-1 ${theme === 'dark' ? 'bg-white/5 ring-white/10' : 'bg-gray-100 ring-gray-200'}`}>
                    <Bot size={32} className={theme === 'dark' ? 'text-white' : 'text-gray-700'} />
                </div>
                <h2 className="text-2xl font-bold mb-2">Pilih Model: {MODELS.find(m => m.id === selectedModel)?.name}</h2>
                <div className="grid grid-cols-2 gap-3 w-full max-w-2xl mt-8">
                   {SUGGESTIONS.map((item, idx) => (
                    <button key={idx} onClick={() => sendMessage(item.text)} className={`flex flex-col gap-2 p-4 border rounded-2xl text-left transition-all hover:-translate-y-1 ${theme === 'dark' ? 'bg-[#1e1e1e] hover:bg-[#27272a] border-white/5' : 'bg-white hover:bg-gray-50 border-gray-200 shadow-sm'}`}>
                      <div className="text-blue-500">{item.icon}</div><span className="text-sm font-medium opacity-80">{item.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentMessages.map((msg, index) => (
              <div key={index} className="w-full group">
                 <div className={`py-6 border-b ${theme === 'dark' ? 'border-white/5' : 'border-gray-100'}`}>
                    <div className="flex gap-4 md:gap-6 mx-auto">
                        <div className={`flex-shrink-0 w-8 h-8 rounded-sm flex items-center justify-center mt-0.5 ${msg.role === 'user' ? 'bg-transparent' : 'bg-green-600 rounded-full text-white'}`}>
                            {msg.role === 'user' ? <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white"><UserIcon size={18} /></div> : <Bot size={18} />}
                        </div>
                        <div className="relative flex-1 overflow-hidden">
                            <div className="font-semibold text-sm mb-1 opacity-90">{msg.role === 'user' ? 'You' : 'Tawarln'}</div>
                            {editingMessageIndex === index ? (
                                <div className={`border rounded-xl p-3 ${theme === 'dark' ? 'bg-[#1e1e1e] border-white/10' : 'bg-white border-gray-200 shadow-sm'}`}>
                                    <TextareaAutosize value={editingMessageText} onChange={(e) => setEditingMessageText(e.target.value)} className={`w-full bg-transparent border-none focus:ring-0 resize-none mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`} />
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setEditingMessageIndex(null)} className="px-3 py-1.5 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded-lg">Cancel</button>
                                        <button onClick={saveEditAndRegenerate} className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 rounded-lg text-white">Save & Regenerate</button>
                                    </div>
                                </div>
                            ) : (
                                <div className={`prose max-w-none text-[15px] md:text-[16px] leading-relaxed ${theme === 'dark' ? 'prose-invert' : 'prose-gray'}`}>{renderMessageContent(msg.content)}</div>
                            )}
                            {!editingMessageIndex && (
                                <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => copyMessage(typeof msg.content === 'string' ? msg.content : 'Image content')} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 rounded-md transition-colors" title="Copy text"><Copy size={14} /></button>
                                    {msg.role === 'user' && typeof msg.content === 'string' && (
                                        <button onClick={() => startEditMessage(index, msg.content)} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 rounded-md transition-colors" title="Edit & Regenerate"><Edit2 size={14} /></button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                 </div>
              </div>
            ))}
            
            {loading && (
                <div className="py-8 flex gap-6">
                    <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center animate-pulse text-white"><Bot size={18} /></div>
                    <div className="flex items-center gap-3 mt-2">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <button onClick={handleStop} className="ml-2 flex items-center gap-1 text-xs text-gray-500 border border-gray-300 dark:border-gray-600 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"><StopCircle size={12} /> Stop</button>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className={`absolute bottom-0 left-0 w-full pt-10 pb-6 px-4 bg-gradient-to-t ${theme === 'dark' ? 'from-[#09090b] via-[#09090b] to-transparent' : 'from-white via-white to-transparent'}`}>
          <div className="max-w-[800px] mx-auto">
            {attachment && (
              <div className={`mb-2 p-2 border rounded-xl w-fit flex items-center gap-3 animate-in slide-in-from-bottom-2 ${theme === 'dark' ? 'bg-[#1e1e1e] border-white/10' : 'bg-gray-50 border-gray-200'}`}>
                {attachment.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={attachment.url} className="w-10 h-10 rounded-md object-cover bg-black/10" alt="Preview" />
                ) : <div className="w-10 h-10 bg-black/5 rounded-md flex items-center justify-center"><FileCode size={20} className="text-blue-500" /></div>}
                <div className="text-xs max-w-[150px] truncate font-medium opacity-80">{attachment.name}</div>
                <button onClick={() => { setAttachment(null); if(fileInputRef.current) fileInputRef.current.value = '' }} className="p-1 hover:bg-black/10 rounded-full"><X size={14} /></button>
              </div>
            )}
            <div className={`relative flex items-end gap-2 border rounded-2xl p-3 shadow-lg focus-within:ring-1 transition-all ${theme === 'dark' ? 'bg-[#1e1e1e] border-white/10 focus-within:ring-white/20' : 'bg-white border-gray-200 focus-within:ring-blue-500/50'}`}>
              <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-blue-500 transition-colors rounded-lg hover:bg-black/5 dark:hover:bg-white/5"><Plus size={20} /></button>
              <TextareaAutosize minRows={1} maxRows={8} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Message Tawarln..." className={`flex-1 bg-transparent border-none placeholder-gray-400 focus:ring-0 resize-none py-2 px-2 max-h-[200px] ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`} />
              <button onClick={() => sendMessage(input)} disabled={loading || (!input.trim() && !attachment)} className={`p-2 rounded-lg transition-all ${(input.trim() || attachment) ? (theme === 'dark' ? 'bg-white text-black hover:bg-gray-200' : 'bg-black text-white hover:bg-gray-800') : 'bg-gray-200 dark:bg-zinc-800 text-gray-400 cursor-not-allowed'}`}><Send size={18} /></button>
            </div>
            <p className="text-center text-[11px] text-gray-400 mt-2">Tawarln can make mistakes. Current Model: {MODELS.find(m => m.id === selectedModel)?.name}</p>
          </div>
        </div>
      </main>
    </div>
  );
}