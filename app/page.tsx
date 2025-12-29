'use client';

import { useState, useRef, useEffect, ComponentPropsWithoutRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import TextareaAutosize from 'react-textarea-autosize';
import Image from 'next/image';
import { 
  Send, Trash2, Copy, Check, Bot, User as UserIcon,
  Terminal, Sparkles, Coffee, BookOpen, 
  Menu, Plus, ChevronDown,
  X, FileCode, Pencil, MoreHorizontal, Sliders, LogOut, 
  Sun, Moon, AlertTriangle, Globe, 
  ShieldCheck, Cloud, Edit2,
  Gamepad2, Plane, Music, Code2, HeartPulse, Lightbulb
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { supabase } from './supabaseClient';
import { User } from '@supabase/supabase-js';

// --- CONSTANTS ---
const MODELS = [
  { id: 'Claude Sonnet 4.5', name: 'Claude 3.5 Sonnet', desc: 'Best for Vision & Code' },
  { id: 'GLM 4.6', name: 'GLM 4.6', desc: 'Balanced' },
  { id: 'Kimi K2', name: 'Kimi K2', desc: 'Creative' },
  { id: 'Llama 4 Maverick', name: 'Llama 4', desc: 'Fastest' },
  { id: 'MiniMax M2', name: 'MiniMax M2', desc: 'General Purpose' },
  { id: 'Qwen 3 30BA3B', name: 'Qwen 3', desc: 'Smart Logic' },
];

const ALL_SUGGESTIONS = [
  { icon: <Terminal size={18} />, text: "Buatin script Python buat login", label: "Coding" },
  { icon: <Sparkles size={18} />, text: "Analisa gambar yang gw upload", label: "Vision" },
  { icon: <BookOpen size={18} />, text: "Jelaskan isi file code ini", label: "Analysis" },
  { icon: <Coffee size={18} />, text: "Resep masakan dari bahan sisa", label: "Lifestyle" },
  { icon: <Gamepad2 size={18} />, text: "Ide nama nickname game keren", label: "Gaming" },
  { icon: <Plane size={18} />, text: "Itinerary liburan ke Bali 3 hari", label: "Travel" },
  { icon: <Code2 size={18} />, text: "Debug error React useEffect", label: "Programming" },
  { icon: <Music size={18} />, text: "Rekomendasi lagu buat kerja", label: "Music" },
  { icon: <HeartPulse size={18} />, text: "Tips tidur cepat dan nyenyak", label: "Health" },
  { icon: <Lightbulb size={18} />, text: "Ide startup berbasis AI", label: "Business" },
];

// --- TYPES ---
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
  webSearch: boolean;
}

type DatabaseChat = {
  id: string;
  user_id: string;
  title: string;
  messages: Message[]; 
  created_at: number;
  model: string | null;
};

interface TextItem {
  str: string;
}

// --- COMPONENTS ---
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

  if (inline) return <code className="bg-zinc-100 dark:bg-zinc-800 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>;

  return (
    <div className="relative my-4 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#121214] shadow-sm group">
      <div className="flex justify-between items-center bg-zinc-100 dark:bg-zinc-900/50 px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400 select-none border-b border-zinc-200 dark:border-zinc-800">
        <span className="uppercase font-semibold tracking-wider font-mono text-blue-500 dark:text-blue-400">{language}</span>
        <button onClick={handleCopy} className="flex items-center gap-1.5 hover:text-black dark:hover:text-white transition-colors">
          {isCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          <span>{isCopied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="p-4 overflow-x-auto text-sm">
        <code className={`!bg-transparent ${className}`} {...props}>{children}</code>
      </div>
    </div>
  );
};

// --- APP ---
export default function Home() {
  const [user, setUser] = useState<User | null>(null); 
  const [authLoading, setAuthLoading] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // UI States
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); 
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [isWebSearchActive, setIsWebSearchActive] = useState(false);
  const [randomSuggestions, setRandomSuggestions] = useState<typeof ALL_SUGGESTIONS>([]);
  
  // Config
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);

  // Edit & Attach
  const [attachment, setAttachment] = useState<{ url: string; type: 'image' | 'file'; name: string; content?: string } | null>(null);
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

  // Init
  useEffect(() => {
    // 1. Acak Ide
    const shuffled = [...ALL_SUGGESTIONS].sort(() => 0.5 - Math.random());
    setRandomSuggestions(shuffled.slice(0, 4));

    // 2. Auth Check
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setAuthLoading(false);
    };
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    
    // 3. Theme
    const savedTheme = localStorage.getItem('tawarln_theme');
    if (savedTheme === 'light') setTheme('light');
    
    return () => subscription.unsubscribe();
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('tawarln_theme', newTheme);
  };

  const copyMessage = useCallback((text: string) => { 
    navigator.clipboard.writeText(text); 
    toast.success('Copied'); 
  }, []);

  // DB Sync
  const syncSessionToDb = useCallback(async (session: ChatSession) => {
    if (!user) return;
    setIsSyncing(true);
    await supabase.from('chats').upsert({ 
      id: session.id, user_id: user.id, title: session.title, 
      messages: session.messages as unknown, created_at: session.createdAt, model: session.model 
    });
    setIsSyncing(false);
  }, [user]);

  const deleteSessionFromDb = useCallback(async (id: string) => {
    if (!user) return;
    await supabase.from('chats').delete().eq('id', id);
  }, [user]);

  // Model Change Logic
  useEffect(() => {
    if (currentSessionId) {
        const sess = sessions.find(s => s.id === currentSessionId);
        if (sess?.model) setSelectedModel(sess.model);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]); 

  const handleModelChange = (newModelId: string) => {
    setSelectedModel(newModelId); 
    setIsModelMenuOpen(false); 
    if (currentSessionId) {
        setSessions(prev => prev.map(s => {
            if (s.id === currentSessionId) {
                const updated = { ...s, model: newModelId };
                syncSessionToDb(updated);
                return updated;
            }
            return s;
        }));
    }
  };

  const createNewChat = useCallback(() => {
    if (!user) return;
    const newId = Date.now().toString();
    const newSession: ChatSession = { id: newId, title: 'New Chat', messages: [], createdAt: Date.now(), model: selectedModel };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setIsSidebarOpen(false);
    setAttachment(null);
    syncSessionToDb(newSession);
  }, [selectedModel, user, syncSessionToDb]);

  // Initial Fetch
  useEffect(() => {
    if (!user) return;
    const fetchChats = async () => {
      setIsSyncing(true);
      const { data, error } = await supabase.from('chats').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        const loadedSessions: ChatSession[] = (data as DatabaseChat[]).map((row) => ({ id: row.id, title: row.title, messages: row.messages, createdAt: row.created_at, model: row.model || MODELS[0].id }));
        setSessions(loadedSessions);
        if (loadedSessions.length > 0) setCurrentSessionId(loadedSessions[0].id);
        else createNewChat();
      } else { createNewChat(); }
      setIsSyncing(false);
    };
    fetchChats();
  }, [user, createNewChat]);

  useEffect(() => { localStorage.setItem('tawarln_settings', JSON.stringify({ systemPrompt, temperature })); }, [systemPrompt, temperature]);
  
  // FIX SCROLL: Scroll ke bawah setiap kali pesan berubah
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [currentMessages, attachment]);

  // PDF & File Logic
  const extractTextFromPdf = async (data: ArrayBuffer): Promise<string> => {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => (item as TextItem).str).join(" ");
      fullText += pageText + "\n";
    }
    return fullText;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Max 10MB'); return; }

    if (file.type === 'application/pdf') {
      const arrayBuffer = await file.arrayBuffer();
      try {
        const text = await extractTextFromPdf(arrayBuffer);
        setAttachment({ url: '', type: 'file', name: file.name, content: text });
        toast.success('PDF analyzed!');
      } catch (error) { console.error(error); toast.error('Failed to read PDF'); }
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => setAttachment({ url: reader.result as string, type: 'image', name: file.name });
      reader.readAsDataURL(file);
    } else {
        const reader = new FileReader();
        reader.onloadend = () => setAttachment({ url: '', type: 'file', name: file.name, content: reader.result as string });
        reader.readAsText(file);
    }
  };

  // Actions
  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) toast.error(error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSessions([]); setCurrentSessionId(null);
    toast.success("Logged out");
  };

  const confirmDeleteChat = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setChatToDelete(id);
      setIsDeleteModalOpen(true);
      setActiveMenuId(null);
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
      setIsDeleteModalOpen(false);
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

  const startEditMessage = (index: number, content: MessageContent) => {
    if (typeof content === 'string') { 
      setEditingMessageIndex(index); 
      setEditingMessageText(content); 
    }
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
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: [...s.messages, initialBotMsg] } : s));
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
                newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], content: streamedText };
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
      if (error instanceof Error && error.name === 'AbortError') {
        toast.info('Stopped.');
      } else {
        toast.error('Error generating response.');
      }
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
    const apiPayload: ChatPayload = { messages: newMessages.map(m => ({ role: m.role, content: m.content })), model: selectedModel, systemPrompt, temperature, webSearch: isWebSearchActive };
    await handleStreamingResponse(apiPayload, currentSessionId);
  };

  const sendMessage = async (text: string) => {
    if ((!text.trim() && !attachment) || loading || !currentSessionId) return;

    let userContent: MessageContent = text;
    let apiContent: VisionContent = [];

    if (attachment) {
      if (attachment.type === 'image') {
        apiContent = [{ type: 'text', text: text || "Analyze this image" }, { type: 'image_url', image_url: { url: attachment.url } }];
        userContent = apiContent;
      } else {
        const pdfText = `[File: ${attachment.name}]\n\nContent: ${attachment.content}\n\nUser Question: ${text}`;
        userContent = `📄 Attached: ${attachment.name}\n${text}`;
        apiContent = [{ type: 'text', text: pdfText }];
      }
    } else { apiContent = [{ type: 'text', text }]; }

    const userMsg: Message = { role: 'user', content: userContent };
    
    setSessions(prev => prev.map(session => {
        if (session.id === currentSessionId) {
            const newTitle = session.messages.length === 0 ? (typeof userContent === 'string' ? userContent.slice(0,30) : 'File Analysis') : session.title;
            const updatedSession = { ...session, title: newTitle, messages: [...session.messages, userMsg], model: selectedModel };
            syncSessionToDb(updatedSession);
            return updatedSession;
        }
        return session;
    }));

    setInput(''); setAttachment(null);
    const session = sessions.find(s => s.id === currentSessionId);
    const payload = [...(session?.messages || []).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: apiContent }];
    await handleStreamingResponse({ messages: payload, model: selectedModel, systemPrompt, temperature, webSearch: isWebSearchActive }, currentSessionId);
  };

  const handleStop = () => abortControllerRef.current?.abort();
  const renderMessageContent = (content: MessageContent) => {
    if (typeof content === 'string') return <ReactMarkdown components={{ code: CodeBlock }}>{content}</ReactMarkdown>;
    return (
      <div className="flex flex-col gap-2">
        {content.map((part, i) => (
          part.type === 'image_url' ? (
            <Image key={i} src={part.image_url?.url || ''} alt="Uploaded" width={600} height={400} className="max-w-full md:max-w-md rounded-lg border border-zinc-200 dark:border-zinc-800 h-auto w-auto" />
          ) : (
            <ReactMarkdown key={i} components={{ code: CodeBlock }}>{part.text || ''}</ReactMarkdown>
          )
        ))}
      </div>
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } };
  const closeAllMenus = () => { setActiveMenuId(null); setIsModelMenuOpen(false); setIsProfileMenuOpen(false); setIsDeleteModalOpen(false); };
  const toggleMenu = (id: string) => setActiveMenuId(activeMenuId === id ? null : id);

  if (authLoading) return <div className={`flex h-screen items-center justify-center ${theme === 'dark' ? 'bg-[#09090b] text-white' : 'bg-white text-zinc-900'}`}>Loading...</div>;

  if (!user) return (
      <div className="flex h-screen items-center justify-center bg-[#09090b] text-white p-4">
        <div className="w-full max-w-md bg-[#18181b] border border-zinc-800 rounded-2xl p-8 shadow-2xl text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-zinc-800/50 rounded-2xl flex items-center justify-center shadow-lg border border-zinc-700/50 p-4">
              <Image src="/logo.png" alt="Tawarln Logo" width={80} height={80} className="w-full h-full object-contain" />
            </div>
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to Tawarln</h1>
          <p className="text-zinc-400 mb-8 text-sm">Sign in to sync your history across devices.</p>
          <button onClick={handleLogin} className="w-full flex items-center justify-center gap-3 bg-white text-black font-semibold py-3 rounded-xl hover:bg-zinc-200 transition-all active:scale-95">
            <ShieldCheck size={20} /> Continue with Google
          </button>
        </div>
      </div>
    );

  return (
    <div className={`flex h-[100dvh] font-sans overflow-hidden ${theme === 'dark' ? 'bg-[#09090b] text-zinc-100' : 'bg-white text-zinc-900'}`}>
      <Toaster position="top-center" theme={theme} />
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} accept="image/*,.pdf,.txt,.js,.py" />

      {(activeMenuId || isModelMenuOpen || isProfileMenuOpen || isDeleteModalOpen) && <div className="fixed inset-0 z-[25]" onClick={closeAllMenus} />}

      {/* MODAL DELETE */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
            <div className={`border rounded-2xl w-full max-w-sm p-6 shadow-2xl relative scale-100 ${theme === 'dark' ? 'bg-[#18181b] border-zinc-800' : 'bg-white border-zinc-200'}`}>
                <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 text-red-500"><AlertTriangle size={24} /></div>
                    <h3 className="text-lg font-bold mb-1">Delete Chat?</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">This action cannot be undone.</p>
                    <div className="flex gap-3 w-full">
                        <button onClick={() => setIsDeleteModalOpen(false)} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${theme === 'dark' ? 'bg-zinc-800 hover:bg-zinc-700' : 'bg-zinc-100 hover:bg-zinc-200'}`}>Cancel</button>
                        <button onClick={executeDeleteChat} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-700 text-white">Delete</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
            <div className={`border rounded-2xl w-full max-w-md p-6 relative ${theme === 'dark' ? 'bg-[#18181b] border-zinc-800' : 'bg-white border-zinc-200'}`}>
                <button onClick={() => setIsSettingsOpen(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-red-500"><X size={20} /></button>
                <h2 className="text-xl font-bold mb-1 flex items-center gap-2"><Sliders size={20} className="text-blue-500"/> Settings</h2>
                <div className="space-y-4 mt-6">
                    <div>
                      <label className="text-xs font-medium uppercase text-zinc-500 mb-2 block">System Instructions</label>
                      <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className={`w-full h-32 border rounded-xl p-3 text-sm focus:ring-1 focus:ring-blue-500 outline-none resize-none ${theme === 'dark' ? 'bg-black/50 border-zinc-700 text-zinc-200' : 'bg-zinc-50 border-zinc-200 text-zinc-900'}`} placeholder="How should Tawarln behave?" />
                    </div>
                    <div>
                      <label className="text-xs font-medium uppercase text-zinc-500 mb-2 block flex justify-between"><span>Creativity</span> <span>{temperature}</span></label>
                      <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full h-2 accent-blue-500 rounded-lg cursor-pointer bg-zinc-200 dark:bg-zinc-700 appearance-none" />
                    </div>
                </div>
                <button onClick={() => setIsSettingsOpen(false)} className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl transition-colors">Save Changes</button>
            </div>
        </div>
      )}

      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-[280px] border-r transform transition-transform duration-300 md:relative md:translate-x-0 backdrop-blur-xl ${theme === 'dark' ? 'bg-black/50 border-zinc-800' : 'bg-zinc-50/80 border-zinc-200'} ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full p-4">
          <div className="flex items-center gap-3 px-2 mb-6 mt-1">
            <div className="w-8 h-8 relative rounded-lg overflow-hidden">
                 <Image src="/logo.png" alt="Tawarln Logo" fill className="object-contain" />
            </div>
            <span className={`text-lg font-bold tracking-tight bg-gradient-to-r from-blue-400 to-emerald-400 text-transparent bg-clip-text`}>Tawarln AI</span>
          </div>
          <button onClick={createNewChat} className={`flex items-center justify-between w-full px-3 py-3 mb-4 rounded-xl border text-sm font-medium transition-all ${theme === 'dark' ? 'border-zinc-800 text-white hover:bg-zinc-800/50 active:scale-[0.98]' : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-sm active:scale-[0.98]'}`}>
            <div className="flex items-center gap-3"><div className="p-1 bg-black text-white dark:bg-white dark:text-black rounded-md"><Plus size={16} /></div>New Chat</div>
          </button>
          
          <div className="px-3 mb-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex justify-between items-center">
            <span>History</span>
            {isSyncing && <Cloud size={10} className="text-blue-500 animate-pulse"/>}
          </div>

          <div className="flex-1 overflow-y-auto pb-4">
            {sessions.map((s) => (
              <div key={s.id} className={`group flex items-center justify-between rounded-lg text-sm cursor-pointer transition-colors ${currentSessionId === s.id ? (theme === 'dark' ? 'bg-white/10 text-white' : 'bg-white shadow-sm text-zinc-900') : 'text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5'}`}>
                <div className="flex-1 truncate py-2.5 pl-3" onClick={() => { setCurrentSessionId(s.id); setIsSidebarOpen(false); }}>
                  {editingSessionId === s.id ? <form onSubmit={saveRename}><input autoFocus value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onBlur={() => setEditingSessionId(null)} className="bg-transparent border border-blue-500 rounded px-1.5 py-0.5 w-full outline-none text-xs" /></form> : <span className="text-[13px]">{s.title}</span>}
                </div>
                <div className="pr-1 relative">
                    {/* LOGIC TITIK TIGA: DI HP SELALU MUNCUL, DI PC MUNCUL PAS HOVER */}
                    <button onClick={(e) => { e.stopPropagation(); toggleMenu(s.id); }} className={`p-1.5 rounded-md transition-opacity opacity-100 md:opacity-0 md:group-hover:opacity-100 ${activeMenuId === s.id ? 'opacity-100 bg-zinc-200 dark:bg-white/10' : 'hover:bg-zinc-200 dark:hover:bg-white/10'}`}><MoreHorizontal size={14} /></button>
                    {activeMenuId === s.id && <div className={`absolute right-0 top-8 w-32 border rounded-lg shadow-xl py-1 z-50 overflow-hidden ${theme === 'dark' ? 'bg-[#1e1e1e] border-zinc-700' : 'bg-white border-zinc-200'}`}>
                        <button onClick={(e) => startRename(e, s)} className="flex items-center gap-2 px-3 py-2 text-xs w-full hover:bg-zinc-100 dark:hover:bg-white/5"><Pencil size={12} /> Rename</button>
                        <button onClick={(e) => confirmDeleteChat(e, s.id)} className="flex items-center gap-2 px-3 py-2 text-xs text-red-500 w-full hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={12} /> Delete</button>
                    </div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col relative w-full h-full overflow-hidden">
        {/* HEADER */}
        <header className={`flex items-center justify-between px-4 py-3 z-[30] border-b ${theme === 'dark' ? 'bg-[#09090b] border-zinc-800' : 'bg-white border-zinc-200'}`}>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-zinc-500 p-2 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg"><Menu size={20} /></button>
            <div className="relative">
                <button onClick={() => setIsModelMenuOpen(!isModelMenuOpen)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors">
                    <span className="bg-gradient-to-r from-blue-500 to-cyan-500 text-transparent bg-clip-text font-semibold">{MODELS.find(m => m.id === selectedModel)?.name}</span>
                    <ChevronDown size={14} className="text-zinc-400"/>
                </button>
                {isModelMenuOpen && <div className={`absolute top-full left-0 mt-2 w-64 border rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 ${theme === 'dark' ? 'bg-[#18181b] border-zinc-700' : 'bg-white border-zinc-200'}`}>
                    {MODELS.map((m) => (
                        <button key={m.id} onClick={() => handleModelChange(m.id)} className={`flex flex-col w-full px-3 py-2 rounded-lg text-left transition-colors ${selectedModel === m.id ? 'bg-blue-600 text-white' : 'hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-200'}`}>
                            <span className="text-sm font-medium">{m.name}</span>
                            <span className={`text-[10px] ${selectedModel === m.id ? 'text-blue-200' : 'text-zinc-400'}`}>{m.desc}</span>
                        </button>
                    ))}
                </div>}
            </div>
          </div>
          
          <div className="relative">
            <button onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)} className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-xs hover:ring-2 ring-offset-2 ring-offset-black ring-blue-500 transition-all">{user?.email?.slice(0,2).toUpperCase()}</button>
            {isProfileMenuOpen && <div className={`absolute right-0 top-10 w-56 border rounded-xl shadow-2xl py-1 z-50 animate-in fade-in slide-in-from-top-2 ${theme === 'dark' ? 'bg-[#18181b] border-zinc-700' : 'bg-white border-zinc-200'}`}>
                <div className="px-4 py-3 border-b border-zinc-100 dark:border-white/5 text-xs font-medium text-zinc-500 truncate">{user?.email}</div>
                <button onClick={() => { setIsSettingsOpen(true); setIsProfileMenuOpen(false); }} className="flex items-center gap-3 px-4 py-2.5 text-sm w-full hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"><Sliders size={16} /> Settings</button>
                <button onClick={toggleTheme} className="flex items-center gap-3 px-4 py-2.5 text-sm w-full hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors">{theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>} {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</button>
                <div className="h-[1px] bg-zinc-100 dark:bg-white/5 my-1"></div>
                <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 w-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><LogOut size={16}/> Log Out</button>
            </div>}
          </div>
        </header>

        {/* CHAT AREA (NATIVE BROWSER SCROLL) */}
        <div className="flex-1 overflow-y-auto">
            <div className={`max-w-[768px] mx-auto px-4 pb-[150px] pt-8 min-h-full flex flex-col ${currentMessages.length === 0 ? 'justify-center' : ''}`}>
            
            {/* EMPTY STATE (CENTERED) */}
            {currentMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500 py-10">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                        <Bot size={32} className="text-blue-500" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2 tracking-tight text-center">How can I help you today?</h2>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl mt-8">
                        {randomSuggestions.map((item, idx) => (
                            <button key={idx} onClick={() => sendMessage(item.text)} className={`flex items-start gap-4 p-4 border rounded-xl text-left transition-all hover:-translate-y-0.5 ${theme === 'dark' ? 'bg-[#18181b] border-zinc-800 hover:bg-[#202023]' : 'bg-white border-zinc-200 hover:bg-zinc-50 shadow-sm'}`}>
                                <div className="text-blue-500 mt-0.5">{item.icon}</div>
                                <div>
                                    <div className="text-sm font-semibold mb-0.5">{item.label}</div>
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">{item.text}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
            
            {/* CHAT BUBBLES */}
            {currentMessages.map((msg, index) => (
              <div key={index} className="py-6 group animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex gap-4 md:gap-6">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${msg.role === 'assistant' ? 'bg-emerald-600 text-white' : 'bg-gradient-to-br from-purple-600 to-blue-600 text-white'}`}>
                        {msg.role === 'assistant' ? <Bot size={18} /> : <UserIcon size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm mb-1 opacity-90">{msg.role === 'assistant' ? 'Tawarln' : 'You'}</div>
                        
                        {editingMessageIndex === index ? (
                            <div className={`border rounded-xl p-3 ${theme === 'dark' ? 'bg-[#18181b] border-zinc-800' : 'bg-white border-zinc-200 shadow-sm'}`}>
                            <TextareaAutosize value={editingMessageText} onChange={(e) => setEditingMessageText(e.target.value)} className={`w-full bg-transparent border-none focus:ring-0 resize-none mb-2 ${theme === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`} />
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setEditingMessageIndex(null)} className="px-3 py-1.5 text-xs bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg transition-colors">Cancel</button>
                                <button onClick={saveEditAndRegenerate} className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white transition-colors">Save & Regenerate</button>
                            </div>
                            </div>
                        ) : (
                            <div className={`prose max-w-none text-[15px] leading-7 ${theme === 'dark' ? 'prose-invert prose-p:text-zinc-300' : 'prose-zinc prose-p:text-zinc-700'}`}>
                                {renderMessageContent(msg.content)}
                            </div>
                        )}

                        {!editingMessageIndex && (
                            <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <button onClick={() => copyMessage(typeof msg.content === 'string' ? msg.content : 'Image content')} className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-md transition-colors" title="Copy"><Copy size={14} /></button>
                            {msg.role === 'user' && typeof msg.content === 'string' && (
                                <button onClick={() => startEditMessage(index, msg.content)} className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-md transition-colors" title="Edit"><Edit2 size={14} /></button>
                            )}
                            </div>
                        )}
                    </div>
                </div>
              </div>
            ))}

            {loading && (
                <div className="py-6 flex gap-6 animate-pulse">
                    <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center text-white"><Bot size={18} /></div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce delay-150"></div>
                        <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce delay-300"></div>
                        <button onClick={handleStop} className="ml-4 text-xs border border-zinc-300 dark:border-zinc-700 px-2 py-1 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors">Stop generating</button>
                    </div>
                </div>
            )}
            {/* SPALER AGAR CHAT TERAKHIR TIDAK TERTUTUP INPUT */}
            <div ref={messagesEndRef} className="h-4" />
        </div></div>

        {/* INPUT AREA (FIXED BOTTOM with BLUR) */}
        <div className={`absolute bottom-0 left-0 w-full pt-4 pb-6 px-4 bg-gradient-to-t ${theme === 'dark' ? 'from-[#09090b] via-[#09090b]/90 to-transparent' : 'from-white via-white/90 to-transparent'} backdrop-blur-sm`}>
            <div className="max-w-[768px] mx-auto">
            {attachment && (
              <div className={`mb-2 p-3 border rounded-xl w-fit flex items-center gap-3 animate-in slide-in-from-bottom-2 shadow-lg ${theme === 'dark' ? 'bg-[#18181b] border-zinc-800' : 'bg-white border-zinc-200'}`}>
                {attachment.type === 'image' ? (
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden">
                      <Image src={attachment.url} alt="Attachment" fill className="object-cover" />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center"><FileCode size={20} className="text-blue-500" /></div>
                )}
                <div>
                    <div className="text-xs font-medium truncate max-w-[150px]">{attachment.name}</div>
                    <div className="text-[10px] text-zinc-500 uppercase">Attached</div>
                </div>
                <button onClick={() => setAttachment(null)} className="p-1 hover:bg-red-500/10 hover:text-red-500 rounded-full transition-colors"><X size={14}/></button>
              </div>
            )}
            
            <div className={`relative flex items-end gap-2 border rounded-2xl p-2 shadow-xl focus-within:ring-2 focus-within:ring-blue-500/20 transition-all ${theme === 'dark' ? 'bg-[#18181b] border-zinc-800' : 'bg-white border-zinc-200'}`}>
              <button onClick={() => fileInputRef.current?.click()} className="p-2.5 text-zinc-400 hover:text-blue-500 hover:bg-blue-500/5 rounded-xl transition-colors" title="Upload File"><Plus size={20} /></button>
              <button onClick={() => setIsWebSearchActive(!isWebSearchActive)} className={`p-2.5 transition-all rounded-xl ${isWebSearchActive ? 'text-blue-500 bg-blue-500/10' : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5'}`} title="Web Search">
                  <Globe size={20} className={isWebSearchActive ? 'animate-pulse' : ''}/>
              </button>
              
              <TextareaAutosize 
                minRows={1} maxRows={8} 
                value={input} onChange={(e) => setInput(e.target.value)} 
                onKeyDown={handleKeyDown} 
                placeholder="Message Tawarln..." 
                className={`flex-1 bg-transparent border-none focus:ring-0 py-2.5 px-2 text-[15px] resize-none ${theme === 'dark' ? 'text-zinc-100 placeholder:text-zinc-500' : 'text-zinc-900 placeholder:text-zinc-400'}`} 
              />
              
              <button 
                onClick={() => sendMessage(input)} 
                disabled={loading || (!input.trim() && !attachment)} 
                className={`p-2.5 rounded-xl transition-all duration-200 ${(input.trim() || attachment) ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700 active:scale-95' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'}`}
              >
                  <Send size={18} />
              </button>
            </div>
            <p className="text-center text-[10px] text-zinc-400 mt-3">Tawarln can make mistakes. Consider checking important information.</p>
        </div></div>
      </main>
    </div>
  );
}