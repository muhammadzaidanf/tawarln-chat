'use client';

import { useState, useRef, useEffect, ComponentPropsWithoutRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import TextareaAutosize from 'react-textarea-autosize';
import { 
  Send, Trash2, Copy, Check, Bot, User as UserIcon, // Rename icon biar gak bentrok sama type User
  Terminal, Sparkles, Coffee, BookOpen, 
  Menu, Plus, MessageSquare, ChevronDown, CheckCircle2,
  X, FileCode, Pencil, MoreHorizontal, Edit2, Settings, Sliders, StopCircle, Cloud, LogOut, ShieldCheck
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
// Import User type
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

// Tipe Data Row Database
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

  if (inline) return <code className="bg-white/10 text-blue-300 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>;

  return (
    <div className="relative my-4 rounded-xl overflow-hidden border border-white/10 bg-[#1e1e1e] shadow-2xl group">
      <div className="flex justify-between items-center bg-white/5 px-4 py-2 text-xs text-gray-400 select-none border-b border-white/5">
        <span className="uppercase font-semibold tracking-wider font-mono text-blue-400">{language}</span>
        <button onClick={handleCopy} className="flex items-center gap-1.5 hover:text-white transition-colors">
          {isCopied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
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
  // 1. FIX: Ganti 'any' jadi 'User | null'
  const [user, setUser] = useState<User | null>(null); 
  const [authLoading, setAuthLoading] = useState(true);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
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

  const currentSession = sessions.find(s => s.id === currentSessionId);

  // --- AUTH CHECK ---
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

    return () => subscription.unsubscribe();
  }, []);

  // --- SUPABASE HELPERS (FIXED: Pake useCallback biar gak error linter) ---
  const syncSessionToDb = useCallback(async (session: ChatSession) => {
    if (!user) return;
    
    const { error } = await supabase
      .from('chats')
      .upsert({ 
        id: session.id, 
        user_id: user.id, 
        title: session.title, 
        messages: session.messages as unknown, 
        created_at: session.createdAt,
        model: session.model 
      });
    if (error) console.error('Gagal sync ke DB:', error);
  }, [user]); // Dependency: user

  const deleteSessionFromDb = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from('chats').delete().eq('id', id);
    if (error) console.error('Gagal hapus dari DB:', error);
  }, [user]);

  // --- INITIAL LOAD ---
  // 3. FIX: createNewChat didefinisikan DULUAN biar bisa dipake di useEffect
  const createNewChat = useCallback(() => {
    if (!user) return;
    const newId = Date.now().toString();
    const newSession: ChatSession = { id: newId, title: 'New Chat', messages: [], createdAt: Date.now(), model: selectedModel };
    
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setIsSidebarOpen(false);
    setAttachment(null);
    
    syncSessionToDb(newSession);
  }, [selectedModel, user, syncSessionToDb]); // Include syncSessionToDb

  useEffect(() => {
    if (!user) return;

    const fetchChats = async () => {
      setIsSyncing(true);
      const { data, error } = await supabase.from('chats').select('*').order('created_at', { ascending: false });
      
      if (!error && data) {
        const loadedSessions: ChatSession[] = (data as DatabaseChat[]).map((row) => ({
          id: row.id,
          title: row.title,
          messages: row.messages, 
          createdAt: row.created_at,
          model: row.model || MODELS[0].id
        }));
        
        setSessions(loadedSessions);
        if (loadedSessions.length > 0) setCurrentSessionId(loadedSessions[0].id);
        else createNewChat();
      } else {
        createNewChat();
      }
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
  }, [user, createNewChat]); // Include createNewChat

  useEffect(() => {
    localStorage.setItem('tawarln_settings', JSON.stringify({ systemPrompt, temperature }));
  }, [systemPrompt, temperature]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [currentMessages, attachment]);
  useEffect(() => { if (currentSession?.model) setSelectedModel(currentSession.model); }, [currentSession]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return; }
    const reader = new FileReader();
    reader.onloadend = () => setAttachment({ url: reader.result as string, type: file.type.startsWith('image/') ? 'image' : 'file', name: file.name });
    if (file.type.startsWith('image/')) reader.readAsDataURL(file); else reader.readAsText(file);
  };

  // AUTH ACTIONS
  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google', 
      options: {
        redirectTo: window.location.origin // Ini bakal deteksi localhost atau IP
      }
    });
    if (error) toast.error(error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSessions([]); 
    setCurrentSessionId(null);
    toast.success("Logged out");
  };

  const deleteChat = async (e: React.MouseEvent, id: string) => {
    if (confirm('Delete chat?')) {
      const newSess = sessions.filter(s => s.id !== id);
      setSessions(newSess);
      await deleteSessionFromDb(id);
      if (currentSessionId === id) {
        if (newSess.length > 0) setCurrentSessionId(newSess[0].id);
        else createNewChat();
      }
    }
    setActiveMenuId(null);
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortControllerRef.current.signal
      });

      if (!res.ok || !res.body) throw new Error(res.statusText);

      const initialBotMsg: Message = { role: 'assistant', content: '' };
      
      setSessions(prev => {
          const updatedSessions = prev.map(s => s.id === sessionId ? { ...s, messages: [...s.messages, initialBotMsg] } : s);
          return updatedSessions;
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
      if (error instanceof Error && error.name === 'AbortError') {
        toast.info('Stopped.');
      } else {
        toast.error('Error generating response.');
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const saveEditAndRegenerate = async () => {
    if (!currentSessionId || editingMessageIndex === null) return;

    const currentHist = sessions.find(s => s.id === currentSessionId)?.messages || [];
    const keptMessages = currentHist.slice(0, editingMessageIndex);
    const newUserMsg: Message = { role: 'user', content: editingMessageText };
    const newMessages = [...keptMessages, newUserMsg];

    setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: newMessages } : s));
    setEditingMessageIndex(null);

    const apiPayload: ChatPayload = {
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        model: selectedModel,
        systemPrompt,
        temperature
    };

    await handleStreamingResponse(apiPayload, currentSessionId);
  };

  const sendMessage = async (text: string) => {
    if ((!text.trim() && !attachment) || loading || !currentSessionId) return;

    let userContent: MessageContent = text;
    let apiContent: VisionContent = [];

    if (attachment) {
      if (attachment.type === 'image') {
        const visionPayload: VisionContent = [{ type: 'text', text: text || "Analyze this image" }, { type: 'image_url', image_url: { url: attachment.url } }];
        userContent = visionPayload;
        apiContent = visionPayload; 
      } else {
        const combinedText = `[File: ${attachment.name}]\n\`\`\`\n${attachment.url}\n\`\`\`\n\n${text}`;
        userContent = combinedText;
        apiContent = [{ type: 'text', text: combinedText }];
      }
    } else {
      apiContent = [{ type: 'text', text }];
    }

    const userMsg: Message = { role: 'user', content: userContent };
    
    setSessions(prev => {
        const updated = prev.map(session => {
            if (session.id === currentSessionId) {
                const newTitle = session.messages.length === 0 ? (typeof userContent === 'string' ? userContent.slice(0,30) : 'Image Analysis') : session.title;
                const updatedSession = { ...session, title: newTitle, messages: [...session.messages, userMsg], model: selectedModel };
                syncSessionToDb(updatedSession);
                return updatedSession;
            }
            return session;
        });
        return updated;
    });

    setInput(''); setAttachment(null); if(fileInputRef.current) fileInputRef.current.value = ''; 

    const currentHist = sessions.find(s => s.id === currentSessionId)?.messages || [];
    const historyPayload = currentHist.map(m => ({ role: m.role, content: m.content }));
    const payload = [...historyPayload, { role: 'user', content: apiContent }];

    const apiPayload: ChatPayload = {
        messages: payload,
        model: selectedModel,
        systemPrompt,
        temperature
    };

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

  const closeAllMenus = () => { setActiveMenuId(null); setIsModelMenuOpen(false); };
  const toggleMenu = (id: string) => { setActiveMenuId(activeMenuId === id ? null : id); };

  // --- LOGIN SCREEN RENDER ---
  if (authLoading) return <div className="flex h-screen items-center justify-center bg-[#09090b] text-white">Loading...</div>;

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#09090b] text-white p-4">
        <div className="w-full max-w-md bg-[#1e1e1e] border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Bot size={32} className="text-white" />
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

  // --- MAIN APP RENDER ---
  return (
    <div className="flex h-[100dvh] bg-[#09090b] text-gray-100 font-sans overflow-hidden">
      <Toaster position="top-center" theme="dark" />
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} accept="image/*,.txt,.js,.py,.ts,.json,.md,.html,.css" />

      {(activeMenuId || isModelMenuOpen) && <div className="fixed inset-0 z-[25]" onClick={closeAllMenus} />}

      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
                <button onClick={() => setIsSettingsOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X size={20} /></button>
                <h2 className="text-xl font-bold mb-1 flex items-center gap-2"><Sliders size={20} className="text-blue-400"/> Settings</h2>
                <p className="text-gray-500 text-sm mb-6">Customize Tawarln&apos;s personality</p>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">System Instructions</label>
                        <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="e.g., You are a senior Python developer." className="w-full h-32 bg-black/50 border border-white/10 rounded-xl p-3 text-sm text-gray-200 focus:ring-1 focus:ring-blue-500 outline-none resize-none" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2 flex justify-between"><span>Creativity</span><span className="text-blue-400 font-mono">{temperature}</span></label>
                        <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                    </div>
                </div>
                <button onClick={() => setIsSettingsOpen(false)} className="w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-xl transition-colors">Save Changes</button>
            </div>
        </div>
      )}

      <aside className={`fixed inset-y-0 left-0 z-40 w-[260px] bg-black border-r border-white/10 transform transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full p-3">
          <button onClick={createNewChat} className="flex items-center justify-between w-full px-3 py-3 mb-4 rounded-lg border border-white/10 hover:bg-white/5 transition-colors text-sm font-medium text-white group">
            <div className="flex items-center gap-3"><div className="p-1 bg-white text-black rounded-md group-hover:bg-blue-500 group-hover:text-white transition-colors"><Plus size={16} /></div>New Chat</div><MessageSquare size={16} className="text-gray-500" />
          </button>
          
          <div className="px-3 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center">
            <span>History</span>
            {isSyncing && <Cloud size={12} className="text-blue-400 animate-pulse"/>}
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
            {sessions.map((s) => (
              <div key={s.id} className={`group flex items-center justify-between w-full rounded-lg text-sm cursor-pointer relative ${currentSessionId === s.id ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'}`}>
                <div className="flex-1 truncate py-3 pl-3 pr-2" onClick={() => { if(editingSessionId !== s.id) { setCurrentSessionId(s.id); setIsSidebarOpen(false); }}}>
                  {editingSessionId === s.id ? (
                    <form onSubmit={saveRename} onClick={e => e.stopPropagation()} className="flex items-center gap-2 w-full z-20">
                       <input autoFocus value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onBlur={() => setEditingSessionId(null)} className="bg-[#2d2d2d] border border-blue-500 rounded px-1.5 py-0.5 text-white w-full text-xs outline-none" />
                    </form>
                  ) : <span>{s.title}</span>}
                </div>
                {!editingSessionId && (
                    <div className="relative h-full flex items-center pr-2 z-[30]">
                        <button onClick={(e) => { e.stopPropagation(); toggleMenu(s.id); }} className={`p-1.5 rounded-md transition-all ${activeMenuId === s.id ? 'bg-white/20 text-white opacity-100' : 'opacity-100 md:opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-white'}`}><MoreHorizontal size={16} /></button>
                        {activeMenuId === s.id && (
                            <div className="absolute right-0 top-8 w-32 bg-[#2d2d2d] border border-white/10 rounded-lg shadow-xl overflow-hidden flex flex-col py-1">
                                <button onClick={(e) => { e.stopPropagation(); startRename(e, s); }} className="flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-white/5 w-full text-left"><Pencil size={12} /> Rename</button>
                                <button onClick={(e) => { e.stopPropagation(); deleteChat(e, s.id); }} className="flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 w-full text-left"><Trash2 size={12} /> Delete</button>
                            </div>
                        )}
                    </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-auto pt-3 border-t border-white/10 space-y-1">
            <button onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-3 w-full px-3 py-3 rounded-lg hover:bg-white/5 text-sm text-gray-300 hover:text-white transition-colors"><Settings size={18} /><span>Settings</span></button>
            <button onClick={handleLogout} className="flex items-center gap-3 w-full px-3 py-3 rounded-lg hover:bg-red-900/20 text-sm text-gray-400 hover:text-red-400 transition-colors"><LogOut size={18} /><span>Log Out</span></button>
          </div>
        </div>
      </aside>
      {isSidebarOpen && <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setIsSidebarOpen(false)}/>}

      <main className="flex-1 flex flex-col relative w-full">
        <header className="flex items-center justify-between p-3 sticky top-0 bg-[#09090b]/90 backdrop-blur z-[30] md:p-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-gray-400 p-2"><Menu size={24} /></button>
            <div className="relative z-[30]"> 
              <button onClick={(e) => { e.stopPropagation(); setIsModelMenuOpen(!isModelMenuOpen); }} className="flex items-center gap-2 px-3 py-2 rounded-xl text-lg font-semibold text-gray-200 hover:bg-white/10 transition-colors">
                <span className="bg-gradient-to-r from-blue-400 to-cyan-400 text-transparent bg-clip-text">{MODELS.find(m => m.id === selectedModel)?.name}</span>
                <ChevronDown size={16} className={`text-gray-500 transition-transform ${isModelMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {isModelMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-[280px] bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl p-1.5 flex flex-col gap-1">
                    {MODELS.map((m) => (
                      <button key={m.id} onClick={() => { setSelectedModel(m.id); setIsModelMenuOpen(false); }} className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-left ${selectedModel === m.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/5'}`}>
                        <div><div className="font-medium text-sm">{m.name}</div><div className={`text-xs ${selectedModel === m.id ? 'text-blue-200' : 'text-gray-500'}`}>{m.desc}</div></div>
                        {selectedModel === m.id && <CheckCircle2 size={16} />}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
          {user && (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-blue-500 text-xs font-bold flex items-center justify-center text-white" title={user.email}>
              {user.email?.slice(0,2).toUpperCase()}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-[800px] mx-auto px-4 pb-40 pt-4 md:pt-8">
            {currentMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 ring-1 ring-white/10"><Bot size={32} className="text-white" /></div>
                <h2 className="text-2xl font-bold mb-2">Pilih Model: {MODELS.find(m => m.id === selectedModel)?.name}</h2>
                <div className="grid grid-cols-2 gap-3 w-full max-w-2xl mt-8">
                   {SUGGESTIONS.map((item, idx) => (
                    <button key={idx} onClick={() => sendMessage(item.text)} className="flex flex-col gap-2 p-4 bg-[#1e1e1e] hover:bg-[#27272a] border border-white/5 rounded-2xl text-left transition-all hover:-translate-y-1">
                      <div className="text-blue-400">{item.icon}</div><span className="text-sm font-medium text-gray-300">{item.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentMessages.map((msg, index) => (
              <div key={index} className="w-full text-gray-100 group">
                 <div className="py-6 border-b border-white/5">
                    <div className="flex gap-4 md:gap-6 mx-auto">
                        <div className={`flex-shrink-0 w-8 h-8 rounded-sm flex items-center justify-center mt-0.5 ${msg.role === 'user' ? 'bg-transparent' : 'bg-green-600 rounded-full'}`}>
                            {msg.role === 'user' ? <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center"><UserIcon size={18} /></div> : <Bot size={18} />}
                        </div>
                        <div className="relative flex-1 overflow-hidden">
                            <div className="font-semibold text-sm mb-1 opacity-90">{msg.role === 'user' ? 'You' : 'Tawarln'}</div>
                            {editingMessageIndex === index ? (
                                <div className="bg-[#1e1e1e] border border-white/10 rounded-xl p-3">
                                    <TextareaAutosize value={editingMessageText} onChange={(e) => setEditingMessageText(e.target.value)} className="w-full bg-transparent border-none text-gray-100 focus:ring-0 resize-none mb-2" />
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setEditingMessageIndex(null)} className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded-lg">Cancel</button>
                                        <button onClick={saveEditAndRegenerate} className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 rounded-lg text-white">Save & Regenerate</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="prose prose-invert max-w-none text-[15px] md:text-[16px] leading-relaxed">{renderMessageContent(msg.content)}</div>
                            )}
                            {!editingMessageIndex && (
                                <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => copyMessage(typeof msg.content === 'string' ? msg.content : 'Image content')} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-md transition-colors" title="Copy text"><Copy size={14} /></button>
                                    {msg.role === 'user' && typeof msg.content === 'string' && (
                                        <button onClick={() => startEditMessage(index, msg.content)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-md transition-colors" title="Edit & Regenerate"><Edit2 size={14} /></button>
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
                    <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center animate-pulse"><Bot size={18} /></div>
                    <div className="flex items-center gap-3 mt-2">
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                        <button onClick={handleStop} className="ml-2 flex items-center gap-1 text-xs text-gray-400 border border-gray-600 px-2 py-1 rounded hover:bg-gray-800 transition-colors"><StopCircle size={12} /> Stop</button>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#09090b] via-[#09090b] to-transparent pt-10 pb-6 px-4">
          <div className="max-w-[800px] mx-auto">
            {attachment && (
              <div className="mb-2 p-2 bg-[#1e1e1e] border border-white/10 rounded-xl w-fit flex items-center gap-3 animate-in slide-in-from-bottom-2">
                {attachment.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={attachment.url} className="w-10 h-10 rounded-md object-cover bg-white/5" alt="Preview" />
                ) : <div className="w-10 h-10 bg-white/10 rounded-md flex items-center justify-center"><FileCode size={20} className="text-blue-400" /></div>}
                <div className="text-xs max-w-[150px] truncate text-gray-300 font-medium">{attachment.name}</div>
                <button onClick={() => { setAttachment(null); if(fileInputRef.current) fileInputRef.current.value = '' }} className="p-1 hover:bg-white/10 rounded-full text-gray-400 hover:text-white"><X size={14} /></button>
              </div>
            )}
            <div className="relative flex items-end gap-2 bg-[#1e1e1e] border border-white/10 rounded-2xl p-3 shadow-2xl focus-within:ring-1 focus-within:ring-white/20 transition-all">
              <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"><Plus size={20} /></button>
              <TextareaAutosize minRows={1} maxRows={8} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Message Tawarln..." className="flex-1 bg-transparent border-none text-gray-100 placeholder-gray-500 focus:ring-0 resize-none py-2 px-2 max-h-[200px]" />
              <button onClick={() => sendMessage(input)} disabled={loading || (!input.trim() && !attachment)} className={`p-2 rounded-lg transition-all ${(input.trim() || attachment) ? 'bg-white text-black hover:bg-gray-200' : 'bg-[#3f3f46] text-gray-400 cursor-not-allowed'}`}><Send size={18} /></button>
            </div>
            <p className="text-center text-[11px] text-gray-500 mt-2">Tawarln can make mistakes. Current Model: {MODELS.find(m => m.id === selectedModel)?.name}</p>
          </div>
        </div>
      </main>
    </div>
  );
}