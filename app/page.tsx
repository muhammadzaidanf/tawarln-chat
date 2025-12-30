'use client';

import { useState, useRef, useEffect, ComponentPropsWithoutRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import TextareaAutosize from 'react-textarea-autosize';
import Image from 'next/image';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';
import { 
  Send, Trash2, Copy, Check, Bot, User as UserIcon,
  Sparkles, BookOpen, 
  Plus, ChevronDown,
  X, FileCode, Pencil, MoreHorizontal, Sliders, LogOut, 
  Sun, Moon, AlertTriangle, Globe, 
  ShieldCheck, Cloud, Edit2,
  Plane, Code2, Lightbulb,
  Eye, Code, Share2, PanelLeftClose, PanelLeftOpen, Command, StopCircle,
  LayoutTemplate, Maximize2, BarChart3
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { supabase } from './supabaseClient';
import { User } from '@supabase/supabase-js';

// --- CONSTANTS ---
const MODELS = [
  { id: 'Claude Sonnet 4.5', name: 'Claude 4.5 Sonnet', desc: 'Superior Reasoning' },
  { id: 'GLM 4.6', name: 'GLM 4.6', desc: 'Balanced' },
  { id: 'Kimi K2', name: 'Kimi K2', desc: 'Creative' },
  { id: 'Llama 4 Maverick', name: 'Llama 4', desc: 'Fastest' },
  { id: 'MiniMax M2', name: 'MiniMax M2', desc: 'General' },
  { id: 'Qwen 3 30BA3B', name: 'Qwen 3', desc: 'Logic' },
];

const ALL_SUGGESTIONS = [
  { icon: <BarChart3 size={16} />, text: "Statistik Pengunjung Web (Bar Chart)", label: "Analytics" },
  { icon: <Sparkles size={16} />, text: "Analisa gambar arsitektur", label: "Vision" },
  { icon: <BookOpen size={16} />, text: "Jelaskan konsep Microservices", label: "System Design" },
  { icon: <Code2 size={16} />, text: "ERD Database E-Commerce", label: "Database" },
  { icon: <Plane size={16} />, text: "Tren Penjualan 2024 (Line Chart)", label: "Business" },
  { icon: <Lightbulb size={16} />, text: "Ide bisnis SaaS B2B", label: "Idea" },
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

interface ArtifactState {
  isOpen: boolean;
  content: string;
  language: string;
  type: 'code' | 'chart';
}

interface ChartConfig {
  chartType: 'bar' | 'line' | 'area' | 'pie';
  data: Array<Record<string, string | number>>;
  dataKey: string;
  xAxisKey: string;
  fill?: string;
  title?: string;
}

interface TextItem {
  str: string;
}

// --- CHART RENDERER COMPONENT ---
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const ChartRenderer = ({ config }: { config: ChartConfig }) => {
  if (!config || !config.data) return <div className="text-red-500 text-xs">Invalid Chart Data</div>;

  const { chartType, data, dataKey, xAxisKey, fill, title } = config;
  const chartColor = fill || '#3b82f6';

  return (
    <div className="w-full h-[350px] p-2 flex flex-col">
        {title && <h3 className="text-center font-bold mb-4 text-sm text-zinc-700 dark:text-zinc-200">{title}</h3>}
        <ResponsiveContainer width="100%" height="100%">
            {chartType === 'line' ? (
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                    <XAxis dataKey={xAxisKey} style={{ fontSize: '10px' }} />
                    <YAxis style={{ fontSize: '10px' }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend />
                    <Line type="monotone" dataKey={dataKey} stroke={chartColor} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
            ) : chartType === 'area' ? (
                <AreaChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                    <XAxis dataKey={xAxisKey} style={{ fontSize: '10px' }} />
                    <YAxis style={{ fontSize: '10px' }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none' }} />
                    <Area type="monotone" dataKey={dataKey} stroke={chartColor} fill={chartColor} fillOpacity={0.3} />
                </AreaChart>
            ) : chartType === 'pie' ? (
                <PieChart>
                    <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey={dataKey || 'value'}>
                        {data.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                </PieChart>
            ) : (
                <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                    <XAxis dataKey={xAxisKey} style={{ fontSize: '10px' }} />
                    <YAxis style={{ fontSize: '10px' }} />
                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none' }} />
                    <Legend />
                    <Bar dataKey={dataKey} fill={chartColor} radius={[4, 4, 0, 0]} />
                </BarChart>
            )}
        </ResponsiveContainer>
    </div>
  );
};

// --- COMPONENT: CODE BLOCK ---
interface CodeProps extends ComponentPropsWithoutRef<'code'> { 
    inline?: boolean; 
    onOpenArtifact?: (content: string, language: string, type: 'code' | 'chart') => void;
}

const CodeBlock = ({ inline, className, children, onOpenArtifact, ...props }: CodeProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const [mode, setMode] = useState<'code' | 'preview'>('code'); 
  
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : 'text';
  const codeContent = String(children).replace(/\n$/, '');

  // Detect Chart JSON
  let chartConfig: ChartConfig | null = null;
  if (language === 'json') {
      try {
          const parsed = JSON.parse(codeContent);
          if (parsed.chartType && parsed.data) {
              chartConfig = parsed as ChartConfig;
          }
      } catch {}
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent);
    setIsCopied(true);
    toast.success('Code copied!');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleOpenSidePanel = () => {
      if (onOpenArtifact) {
          onOpenArtifact(codeContent, language, chartConfig ? 'chart' : 'code');
      }
  };

  if (inline) return <code className="bg-zinc-200 dark:bg-zinc-800 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>;

  // Render Chart if valid JSON config found
  if (chartConfig) {
      return (
        <div className="relative my-4 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121214] shadow-sm">
             <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <span className="font-bold uppercase flex items-center gap-1"><BarChart3 size={12}/> {(chartConfig as ChartConfig).chartType} Chart</span>
                <div className="flex gap-2">
                    <button onClick={handleOpenSidePanel} className="flex items-center gap-1 hover:text-blue-500 transition-colors" title="Open in Side View">
                        <LayoutTemplate size={14} /> Open Side View
                    </button>
                </div>
            </div>
            <div className="p-4 bg-white dark:bg-[#18181b]">
                <ChartRenderer config={chartConfig as ChartConfig} />
            </div>
            {/* Show JSON Data below chart in toggleable detail */}
            <details className="text-[10px] text-zinc-500 p-2 border-t border-zinc-200 dark:border-zinc-800 cursor-pointer">
                <summary>View Data Source (JSON)</summary>
                <pre className="mt-2 p-2 bg-zinc-100 dark:bg-black rounded overflow-auto max-h-32">{codeContent}</pre>
            </details>
        </div>
      );
  }

  // Standard Code Block
  const isHtml = language === 'html' || language === 'xml' || language === 'jsx' || language === 'tsx';

  return (
    <div className="relative my-4 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121214] shadow-sm">
      <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex gap-2 items-center">
          <span className="font-mono font-bold text-zinc-600 dark:text-zinc-400 uppercase">{language}</span>
          {isHtml && (
            <div className="flex bg-zinc-200 dark:bg-zinc-800 rounded p-0.5 ml-2">
                <button onClick={() => setMode('code')} className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all ${mode === 'code' ? 'bg-white dark:bg-zinc-700 shadow-sm text-black dark:text-white' : 'text-zinc-500 hover:text-zinc-700'}`}>
                    <Code size={12} /> Code
                </button>
                <button onClick={() => setMode('preview')} className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all ${mode === 'preview' ? 'bg-white dark:bg-zinc-700 shadow-sm text-black dark:text-white' : 'text-zinc-500 hover:text-zinc-700'}`}>
                    <Eye size={12} /> Preview
                </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
            <button onClick={handleOpenSidePanel} className="flex items-center gap-1 hover:text-blue-500 transition-colors" title="Open in Side View">
                <LayoutTemplate size={14} /> <span className="hidden sm:inline">Side View</span>
            </button>
            <button onClick={handleCopy} className="flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors">
                {isCopied ? <Check size={14} /> : <Copy size={14} />} {isCopied ? 'Copied' : 'Copy'}
            </button>
        </div>
      </div>
      <div className="relative">
        {mode === 'code' ? (
             <div className="p-3 overflow-x-auto text-sm font-mono"><code className={`!bg-transparent ${className}`} {...props}>{children}</code></div>
        ) : (
            <div className="w-full h-[300px] bg-white border-none resize-y overflow-auto"><iframe srcDoc={codeContent} className="w-full h-full border-none block" sandbox="allow-scripts" title="Preview"/></div>
        )}
      </div>
    </div>
  );
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null); 
  const [authLoading, setAuthLoading] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); 
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [isWebSearchActive, setIsWebSearchActive] = useState(false);
  const [randomSuggestions, setRandomSuggestions] = useState<typeof ALL_SUGGESTIONS>([]);
  
  // --- ARTIFACT STATE ---
  const [artifact, setArtifact] = useState<ArtifactState>({ isOpen: false, content: '', language: '', type: 'code' });

  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);

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

  useEffect(() => {
    const shuffled = [...ALL_SUGGESTIONS].sort(() => 0.5 - Math.random());
    setRandomSuggestions(shuffled.slice(0, 4));

    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setAuthLoading(false);
    };
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    
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

  const handleShareChat = async (session: ChatSession) => {
      if (!user) return;
      const toastId = toast.loading('Creating shareable link...');
      
      try {
          const { error } = await supabase
              .from('chats')
              .update({ is_shared: true })
              .eq('id', session.id);
          
          if (error) throw error;

          const shareUrl = `${window.location.origin}/share/${session.id}`;
          await navigator.clipboard.writeText(shareUrl);
          
          toast.dismiss(toastId);
          toast.success('Public link copied to clipboard');
      } catch {
          toast.dismiss(toastId);
          toast.error('Failed to create link');
      }
  };

  useEffect(() => {
    if (currentSessionId) {
        const sess = sessions.find(s => s.id === currentSessionId);
        if (sess?.model) setSelectedModel(sess.model);
    }
  }, [currentSessionId, sessions]);

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
    setAttachment(null);
    if(window.innerWidth < 768) setIsSidebarOpen(false);
    syncSessionToDb(newSession);
  }, [selectedModel, user, syncSessionToDb]);

  useEffect(() => {
    if (!user) {
        setSessions([]); 
        return;
    }

    const fetchChats = async () => {
      setIsSyncing(true);
      const { data } = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (data) {
        const loadedSessions: ChatSession[] = (data as DatabaseChat[]).map((row) => ({ 
            id: row.id, 
            title: row.title, 
            messages: row.messages, 
            createdAt: row.created_at, 
            model: row.model || MODELS[0].id 
        }));
        setSessions(loadedSessions);
        
        if (loadedSessions.length > 0) {
            setCurrentSessionId(loadedSessions[0].id);
        } else { 
            createNewChat(); 
        }
      } else { 
          createNewChat(); 
      }
      setIsSyncing(false);
    };

    fetchChats();
  }, [user, createNewChat]); 

  useEffect(() => { localStorage.setItem('tawarln_settings', JSON.stringify({ systemPrompt, temperature })); }, [systemPrompt, temperature]);
  
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [currentMessages, attachment, loading]);

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

  const handleStop = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        setLoading(false);
        toast.info("Stopped generation");
    }
  };

  // ✅ CRITICAL FIX: Passing newMessagesState to prevent Race Condition (User message disappearing)
  const handleStreamingResponse = async (payload: ChatPayload, sessionId: string, newMessagesState: Message[]) => {
    setLoading(true);
    abortControllerRef.current = new AbortController();
    
    const initialBotMsg: Message = { role: 'assistant', content: '' };
    
    // 1. Set Initial State with User Msg + Bot Placeholder
    setSessions(prev => prev.map(s => {
        if (s.id === sessionId) {
            return { ...s, messages: [...newMessagesState, initialBotMsg] };
        }
        return s;
    }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: abortControllerRef.current.signal
      });
      if (!res.ok || !res.body) throw new Error(res.statusText);
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let streamedText = '';
      
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value, { stream: true });
        streamedText += chunkValue;
        
        // 2. Update Bot Message Content Only
        setSessions(prev => prev.map(s => {
            if (s.id === sessionId) {
                const updatedMsgs = [...s.messages];
                const lastIdx = updatedMsgs.length - 1;
                updatedMsgs[lastIdx] = { 
                    ...updatedMsgs[lastIdx],
                    content: streamedText 
                };
                return { ...s, messages: updatedMsgs };
            }
            return s;
        }));
      }
      
      // 3. Sync to DB
      setSessions(prev => {
          const session = prev.find(s => s.id === sessionId);
          if (session) syncSessionToDb(session);
          return prev;
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
         // handled by UI
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
    
    await handleStreamingResponse(apiPayload, currentSessionId, newMessages);
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
    
    const currentSession = sessions.find(s => s.id === currentSessionId);
    const currentHistory = currentSession?.messages || [];
    const newMessagesWithUser = [...currentHistory, userMsg];

    // Optimistic Update
    setSessions(prev => prev.map(session => {
        if (session.id === currentSessionId) {
            const newTitle = session.messages.length === 0 ? (typeof userContent === 'string' ? userContent.slice(0,30) : 'File Analysis') : session.title;
            const updatedSession = { ...session, title: newTitle, messages: newMessagesWithUser, model: selectedModel };
            syncSessionToDb(updatedSession);
            return updatedSession;
        }
        return session;
    }));

    setInput(''); setAttachment(null);
    
    const payload = [...currentHistory.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: apiContent }];
    
    // Pass newMessagesWithUser directly to prevent race condition
    await handleStreamingResponse({ messages: payload, model: selectedModel, systemPrompt, temperature, webSearch: isWebSearchActive }, currentSessionId, newMessagesWithUser);
  };

  const handleOpenArtifact = (content: string, language: string, type: 'code' | 'chart') => {
      setArtifact({ isOpen: true, content, language, type });
  };

  const renderMessageContent = (content: MessageContent) => {
    if (typeof content === 'string') return <ReactMarkdown components={{ code: (props) => <CodeBlock {...props} onOpenArtifact={handleOpenArtifact} /> }}>{content}</ReactMarkdown>;
    return (
      <div className="flex flex-col gap-2">
        {content.map((part, i) => (
          part.type === 'image_url' ? (
            <Image key={i} src={part.image_url?.url || ''} alt="Uploaded" width={600} height={400} className="max-w-full md:max-w-md rounded-lg border border-zinc-200 dark:border-zinc-800 h-auto w-auto" />
          ) : (
            <ReactMarkdown key={i} components={{ code: (props) => <CodeBlock {...props} onOpenArtifact={handleOpenArtifact} /> }}>{part.text || ''}</ReactMarkdown>
          )
        ))}
      </div>
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } };
  const closeAllMenus = () => { setActiveMenuId(null); setIsModelMenuOpen(false); setIsProfileMenuOpen(false); setIsDeleteModalOpen(false); };
  const toggleMenu = (id: string) => setActiveMenuId(activeMenuId === id ? null : id);

  if (authLoading) return <div className={`flex h-screen items-center justify-center ${theme === 'dark' ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-900'}`}>Loading...</div>;

  if (!user) return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/[0.02] -z-10" />
        <div className="w-full max-w-sm bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 shadow-2xl text-center">
          <div className="flex justify-center mb-8">
            <div className="w-24 h-24 bg-zinc-800/80 rounded-2xl flex items-center justify-center shadow-lg border border-zinc-700/50 p-5 ring-4 ring-zinc-800/30">
              <Command size={48} className="text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-3 tracking-tight bg-gradient-to-b from-white to-zinc-400 text-transparent bg-clip-text">Tawarln AI</h1>
          <p className="text-zinc-400 mb-8 text-sm leading-relaxed">Your intelligent companion for coding, creativity, and daily tasks.</p>
          <button onClick={handleLogin} className="w-full flex items-center justify-center gap-3 bg-white text-zinc-950 font-semibold py-3.5 rounded-xl hover:bg-zinc-200 transition-all active:scale-[0.98] shadow-lg shadow-white/5">
            <ShieldCheck size={20} /> Continue with Google
          </button>
        </div>
      </div>
    );

  return (
    <div className={`flex h-[100dvh] font-sans overflow-hidden transition-colors duration-300 ${theme === 'dark' ? 'bg-zinc-950 text-zinc-100' : 'bg-white text-zinc-900'}`}>
      <Toaster position="top-center" theme={theme} />
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} accept="image/*,.pdf,.txt,.js,.py" />

      {(activeMenuId || isModelMenuOpen || isProfileMenuOpen || isDeleteModalOpen) && <div className="fixed inset-0 z-[25]" onClick={closeAllMenus} />}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className={`border rounded-3xl w-full max-w-sm p-6 shadow-2xl relative scale-100 ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                <div className="flex flex-col items-center text-center">
                    <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mb-4 text-red-500 mx-auto"><AlertTriangle size={28} /></div>
                    <h3 className="text-lg font-bold mb-2">Delete Conversation?</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 px-4">This action cannot be undone. The chat history will be permanently removed.</p>
                    <div className="flex gap-3 w-full">
                        <button onClick={() => setIsDeleteModalOpen(false)} className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${theme === 'dark' ? 'bg-zinc-800 hover:bg-zinc-700' : 'bg-zinc-100 hover:bg-zinc-200'}`}>Cancel</button>
                        <button onClick={executeDeleteChat} className="flex-1 py-3 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20">Delete</button>
                    </div>
                </div>
            </div>
        </div>
      )}
      
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className={`border rounded-3xl w-full max-w-md p-6 relative shadow-2xl ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2"><Sliders size={20} className="text-blue-500"/> Preferences</h2>
                    <button onClick={() => setIsSettingsOpen(false)} className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"><X size={20} className="text-zinc-500"/></button>
                </div>
                
                <div className="space-y-6">
                    <div>
                      <label className="text-xs font-semibold uppercase text-zinc-500 mb-2 block tracking-wider">System Instructions</label>
                      <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className={`w-full h-32 bg-black/40 border border-zinc-700 rounded-xl p-3 text-sm text-white resize-none`} placeholder="Custom instructions..." />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase text-zinc-500 mb-4 block flex justify-between tracking-wider"><span>Creativity Level</span> <span className="bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded text-[10px]">{temperature}</span></label>
                      <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full h-2 accent-blue-500 rounded-lg cursor-pointer bg-zinc-200 dark:bg-zinc-800 appearance-none" />
                      <div className="flex justify-between text-[10px] text-zinc-500 mt-2">
                          <span>Precise</span>
                          <span>Balanced</span>
                          <span>Creative</span>
                      </div>
                    </div>
                </div>
                <button onClick={() => setIsSettingsOpen(false)} className="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]">Save Changes</button>
            </div>
        </div>
      )}

      {/* SIDEBAR FIXED */}
      <aside 
        className={`fixed inset-y-0 left-0 z-40 w-[280px] border-r transform transition-transform duration-300 ${theme === 'dark' ? 'bg-zinc-950 border-zinc-900' : 'bg-zinc-50 border-zinc-200'} ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex flex-col h-full p-4 relative">
          
          <div className="flex items-center justify-between px-3 mb-8 mt-2">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 relative bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl p-[1px]">
                <div className={`w-full h-full rounded-[10px] flex items-center justify-center ${theme === 'dark' ? 'bg-zinc-950' : 'bg-white'} overflow-hidden relative`}>
                    <div className="relative w-full h-full flex items-center justify-center">
                        <Image src="/logo.png" alt="Tawarln" fill className="object-contain p-1" onError={(e) => e.currentTarget.style.display = 'none'} />
                        <Command size={20} className="text-transparent bg-clip-text bg-gradient-to-br from-blue-500 to-purple-600 absolute" style={{ zIndex: -1 }} />
                    </div>
                </div>
                </div>
                <span className={`text-xl font-bold tracking-tight bg-gradient-to-r from-blue-500 to-purple-500 text-transparent bg-clip-text`}>Tawarln</span>
            </div>
            
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"><PanelLeftClose size={20} /></button>
          </div>

          <button onClick={createNewChat} className={`group flex items-center justify-between w-full px-4 py-3.5 mb-6 rounded-2xl border text-sm font-medium transition-all ${theme === 'dark' ? 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:text-white' : 'bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300 shadow-sm'}`}>
            <span className="flex items-center gap-2">Create New Chat</span>
            <div className={`p-1 rounded-lg transition-colors ${theme === 'dark' ? 'bg-zinc-800 text-zinc-400 group-hover:text-white' : 'bg-zinc-100 text-zinc-500'}`}><Plus size={16} /></div>
          </button>
          
          <div className="px-3 mb-3 text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex justify-between items-center">
            <span>Recent Activity</span>
            {isSyncing && <Cloud size={12} className="text-blue-500 animate-pulse"/>}
          </div>

          <div className="flex-1 overflow-y-auto pb-4 space-y-1">
            {sessions.map((s) => (
              <div key={s.id} className={`group flex items-center justify-between rounded-xl text-sm cursor-pointer transition-all ${currentSessionId === s.id ? (theme === 'dark' ? 'bg-zinc-900 text-white font-medium' : 'bg-white shadow-sm text-zinc-900 border border-zinc-200') : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900/50 hover:text-zinc-900 dark:hover:text-zinc-300'}`}>
                <div className="flex-1 truncate py-3 pl-4" onClick={() => { setCurrentSessionId(s.id); setIsSidebarOpen(false); }}>
                  {editingSessionId === s.id ? <form onSubmit={saveRename}><input autoFocus value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onBlur={() => setEditingSessionId(null)} className="bg-transparent border-b border-blue-500 px-0 py-0 w-full outline-none text-sm font-normal" /></form> : <span className="text-[13px]">{s.title}</span>}
                </div>
                <div className="pr-2 relative">
                    <button onClick={(e) => { e.stopPropagation(); toggleMenu(s.id); }} className={`p-1.5 rounded-lg transition-opacity opacity-0 group-hover:opacity-100 ${activeMenuId === s.id ? 'opacity-100 bg-zinc-200 dark:bg-zinc-800' : 'hover:bg-zinc-200 dark:hover:bg-zinc-800'}`}><MoreHorizontal size={14} /></button>
                    {activeMenuId === s.id && <div className={`absolute right-0 top-8 w-36 border rounded-xl shadow-xl py-1.5 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                        <button onClick={(e) => { e.stopPropagation(); handleShareChat(s); setActiveMenuId(null); }} className="flex items-center gap-2.5 px-3 py-2 text-xs w-full hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-blue-500 font-medium"><Share2 size={13} /> Share Link</button>
                        <button onClick={(e) => startRename(e, s)} className="flex items-center gap-2.5 px-3 py-2 text-xs w-full hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"><Pencil size={13} /> Rename</button>
                        <div className="h-[1px] bg-zinc-100 dark:bg-zinc-800 mx-3 my-1"></div>
                        <button onClick={(e) => confirmDeleteChat(e, s.id)} className="flex items-center gap-2.5 px-3 py-2 text-xs text-red-500 w-full hover:bg-red-50 dark:hover:bg-red-900/10"><Trash2 size={13} /> Delete</button>
                    </div>}
                </div>
              </div>
            ))}
          </div>
          
          <div className={`mt-2 pt-4 border-t ${theme === 'dark' ? 'border-zinc-900' : 'border-zinc-200'} relative`}>
             <button onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)} className={`flex items-center gap-3 w-full p-2 rounded-xl transition-colors ${theme === 'dark' ? 'hover:bg-zinc-900' : 'hover:bg-zinc-100'}`}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-xs">{user?.email?.slice(0,2).toUpperCase()}</div>
                <div className="flex-1 text-left min-w-0">
                    <div className="text-xs font-medium truncate text-zinc-900 dark:text-zinc-200">{user?.email}</div>
                    <div className="text-[10px] text-zinc-500">Free Plan</div>
                </div>
                <ChevronDown size={14} className={`text-zinc-500 transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
             </button>
             {isProfileMenuOpen && <div className={`absolute bottom-full left-0 mb-2 w-full border rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-bottom-2 ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                <button onClick={() => { setIsSettingsOpen(true); setIsProfileMenuOpen(false); }} className="flex items-center gap-3 px-4 py-2.5 text-sm w-full hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors text-zinc-700 dark:text-zinc-200"><Sliders size={16} /> Preferences</button>
                <button onClick={toggleTheme} className="flex items-center gap-3 px-4 py-2.5 text-sm w-full hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors text-zinc-700 dark:text-zinc-200">{theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>} {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</button>
                <div className="h-[1px] bg-zinc-100 dark:bg-zinc-800 my-1"></div>
                <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 w-full hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"><LogOut size={16}/> Sign Out</button>
             </div>}
          </div>
        </div>
      </aside>

      {/* --- MAIN AREA --- */}
      <main className={`flex-1 flex flex-col relative w-full h-full overflow-hidden transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:ml-[280px]' : 'md:ml-0'}`}>
        <div className="flex w-full h-full relative">
            
            {/* CHAT AREA */}
            <div className={`flex-1 flex flex-col h-full relative transition-all ${artifact.isOpen ? 'w-1/2 hidden md:flex' : 'w-full'}`}>
                <header className={`flex items-center justify-between px-6 py-4 z-[30] backdrop-blur-md absolute top-0 w-full ${theme === 'dark' ? 'bg-zinc-950/80' : 'bg-white/80'}`}>
                    <div className="flex items-center gap-2">
                        
                        {/* TOGGLE BUTTON */}
                        <button 
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
                            className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'text-zinc-400 hover:bg-zinc-800 hover:text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}
                            title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
                        >
                            {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
                        </button>

                        <div className="relative">
                            <button onClick={() => setIsModelMenuOpen(!isModelMenuOpen)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900">
                                <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text font-bold text-lg">{MODELS.find(m => m.id === selectedModel)?.name}</span>
                                <ChevronDown size={16} className="text-zinc-400"/>
                            </button>
                            {isModelMenuOpen && <div className={`absolute top-full left-0 mt-3 w-72 border rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100 ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                                <div className="px-2 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Select Model</div>
                                {MODELS.map((m) => (
                                    <button key={m.id} onClick={() => handleModelChange(m.id)} className={`flex flex-col w-full px-4 py-3 rounded-xl text-left transition-colors ${selectedModel === m.id ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300'}`}>
                                        <span className="text-sm font-semibold">{m.name}</span>
                                        <span className={`text-xs ${selectedModel === m.id ? 'text-zinc-400' : 'text-zinc-500'}`}>{m.desc}</span>
                                    </button>
                                ))}
                            </div>}
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {currentSessionId && (
                            <button 
                            onClick={() => { const s = sessions.find(s => s.id === currentSessionId); if(s) handleShareChat(s); }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all ${theme === 'dark' ? 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
                            >
                                <Share2 size={14} /> Share
                            </button>
                        )}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto pt-20">
                    <div className={`max-w-3xl mx-auto px-4 pb-[180px] min-h-full flex flex-col justify-center`}>
                    
                    {currentMessages.length === 0 && (
                        <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500 py-10">
                            <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-8 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 shadow-xl shadow-blue-500/5">
                                <Sparkles size={40} className="text-blue-500" />
                            </div>
                            <h2 className="text-3xl font-bold mb-3 tracking-tight text-center bg-gradient-to-b from-zinc-800 to-zinc-500 dark:from-white dark:to-zinc-400 text-transparent bg-clip-text">How can I help you today?</h2>
                            <p className="text-zinc-500 dark:text-zinc-400 text-center mb-10 max-w-md">I can help you analyze data, write code, or just brainstorm creative ideas.</p>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                                {randomSuggestions.map((item, idx) => (
                                    <button key={idx} onClick={() => sendMessage(item.text)} className={`group flex items-center gap-4 p-4 border rounded-2xl text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800' : 'bg-white border-zinc-200 hover:border-zinc-300'}`}>
                                        <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-zinc-800 text-blue-400 group-hover:bg-zinc-700' : 'bg-blue-50 text-blue-600 group-hover:bg-blue-100'}`}>{item.icon}</div>
                                        <div>
                                            <div className="text-xs font-bold uppercase tracking-wider opacity-50 mb-0.5">{item.label}</div>
                                            <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 line-clamp-1">{item.text}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <div className="flex flex-col space-y-6">
                        {currentMessages.map((msg, index) => (
                        <div key={index} className={`group ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                            {msg.role === 'user' ? (
                                <div className="flex gap-3 max-w-[80%] flex-row-reverse">
                                    <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                                        <UserIcon size={16} className="text-zinc-600 dark:text-zinc-400" />
                                    </div>
                                    <div className={`px-5 py-3 rounded-2xl ${theme === 'dark' ? 'bg-zinc-800 text-zinc-100' : 'bg-zinc-100 text-zinc-800'}`}>
                                        <div className="prose dark:prose-invert prose-sm max-w-none text-[15px] leading-7">
                                            {renderMessageContent(msg.content)}
                                        </div>
                                        {!editingMessageIndex && (
                                            <div className="flex items-center justify-end gap-2 mt-2 opacity-0 group-hover:opacity-50 transition-opacity">
                                                <button onClick={() => startEditMessage(index, msg.content as string)} className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded"><Edit2 size={12} /></button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex gap-4 md:gap-6 max-w-3xl">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20 mt-1">
                                        <Bot size={18} className="text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-sm mb-2 opacity-90 flex items-center gap-2">
                                            Tawarln 
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">AI</span>
                                        </div>
                                        <div className={`prose max-w-none text-[15px] leading-7 ${theme === 'dark' ? 'prose-invert prose-p:text-zinc-300 prose-headings:text-zinc-100' : 'prose-zinc prose-p:text-zinc-700'}`}>
                                            {renderMessageContent(msg.content)}
                                            {/* INDICATOR LOADING PADA PESAN TERAKHIR AI */}
                                            {index === currentMessages.length - 1 && loading && !msg.content && (
                                                <div className="flex items-center gap-1 mt-2">
                                                    <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></div>
                                                    <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce delay-150"></div>
                                                    <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce delay-300"></div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => copyMessage(typeof msg.content === 'string' ? msg.content : 'Image content')} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"><Copy size={12} /> Copy</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {editingMessageIndex === index && (
                                <div className="mt-2 w-full max-w-3xl mx-auto border rounded-xl p-4 shadow-lg bg-white dark:bg-zinc-900 border-blue-500/50">
                                    <TextareaAutosize value={editingMessageText} onChange={(e) => setEditingMessageText(e.target.value)} className="w-full bg-transparent border-none focus:ring-0 resize-none mb-3 text-zinc-900 dark:text-zinc-100" />
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setEditingMessageIndex(null)} className="px-4 py-2 text-xs bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:opacity-80">Cancel</button>
                                        <button onClick={saveEditAndRegenerate} className="px-4 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save & Regenerate</button>
                                    </div>
                                </div>
                            )}
                        </div>
                        ))}
                    </div>

                    <div ref={messagesEndRef} className="h-4" />
                </div></div>

                <div className="absolute bottom-6 left-0 w-full px-4">
                    <div className="max-w-[768px] mx-auto">
                    {/* FLOATING STOP BUTTON - HANYA MUNCUL SAAT LOADING */}
                    {loading && (
                        <div className="flex justify-center mb-4 animate-in fade-in slide-in-from-bottom-2">
                            <button 
                                onClick={handleStop}
                                className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black px-4 py-2 rounded-full text-xs font-medium shadow-lg flex items-center gap-2 hover:opacity-90 transition-all border border-zinc-700 dark:border-zinc-300"
                            >
                                <StopCircle size={14} className="animate-pulse text-red-500" /> Stop Generating
                            </button>
                        </div>
                    )}

                    {attachment && (
                      <div className={`mb-3 p-3 border rounded-2xl w-fit flex items-center gap-3 animate-in slide-in-from-bottom-2 shadow-xl ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                        {attachment.type === 'image' ? (
                          <div className="relative w-12 h-12 rounded-xl overflow-hidden">
                              <Image src={attachment.url} alt="Attachment" fill className="object-cover" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center"><FileCode size={24} className="text-blue-500" /></div>
                        )}
                        <div>
                            <div className="text-xs font-bold truncate max-w-[150px]">{attachment.name}</div>
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Attached File</div>
                        </div>
                        <button onClick={() => setAttachment(null)} className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-full transition-colors ml-2"><X size={14}/></button>
                      </div>
                    )}
                    
                    <div className={`relative flex items-end gap-2 border p-2 shadow-2xl backdrop-blur-xl transition-all rounded-[26px] ${theme === 'dark' ? 'bg-zinc-900/90 border-zinc-800 focus-within:border-zinc-700' : 'bg-white/90 border-zinc-200 focus-within:border-zinc-300'}`}>
                      <button onClick={() => fileInputRef.current?.click()} className="p-3 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors" title="Upload"><Plus size={20} /></button>
                      <button onClick={() => setIsWebSearchActive(!isWebSearchActive)} className={`p-3 rounded-full transition-all ${isWebSearchActive ? 'text-blue-500 bg-blue-500/10' : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`} title="Web Search">
                          <Globe size={20} className={isWebSearchActive ? 'animate-pulse' : ''}/>
                      </button>
                      
                      <TextareaAutosize 
                        minRows={1} maxRows={8} 
                        value={input} onChange={(e) => setInput(e.target.value)} 
                        onKeyDown={handleKeyDown} 
                        placeholder="Ask anything..." 
                        className={`flex-1 bg-transparent border-none focus:ring-0 py-3 px-2 text-[15px] resize-none max-h-[200px] overflow-y-auto ${theme === 'dark' ? 'text-zinc-100 placeholder:text-zinc-500' : 'text-zinc-900 placeholder:text-zinc-400'}`} 
                      />
                      
                      <button 
                        onClick={() => sendMessage(input)} 
                        disabled={loading || (!input.trim() && !attachment)} 
                        className={`p-3 rounded-full transition-all duration-200 ${(input.trim() || attachment) ? 'bg-zinc-900 dark:bg-white text-white dark:text-black shadow-md hover:opacity-90 active:scale-95' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-300 dark:text-zinc-600 cursor-not-allowed'}`}
                      >
                          <Send size={18} />
                      </button>
                    </div>
                    <p className="text-center text-[10px] text-zinc-400 mt-4 opacity-60">Tawarln AI can make mistakes. Verify important info.</p>
                </div></div>
            </div>

            {/* ARTIFACT SIDE PANEL */}
            {artifact.isOpen && (
                <div className="w-full md:w-1/2 h-full border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121214] flex flex-col absolute md:static z-50 animate-in slide-in-from-right-10 duration-300">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                            {artifact.type === 'chart' ? <BarChart3 size={16}/> : <Code2 size={16}/>}
                            {artifact.type === 'chart' ? 'Chart Preview' : 'Code Preview'}
                        </div>
                        <div className="flex items-center gap-2">
                            <button className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-500" title="Maximize"><Maximize2 size={14}/></button>
                            <button onClick={() => setArtifact({ ...artifact, isOpen: false })} className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-colors"><X size={16}/></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto p-4 bg-zinc-50/50 dark:bg-black/20">
                        {artifact.type === 'chart' ? (
                            <div className="h-full flex flex-col items-center justify-center bg-white dark:bg-[#1e1e24] rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-4">
                                {(() => {
                                    try {
                                        const config = JSON.parse(artifact.content);
                                        return <ChartRenderer config={config} />;
                                    } catch {
                                        return <div className="text-red-500">Invalid JSON Data</div>;
                                    }
                                })()}
                            </div>
                        ) : (
                            <div className="h-full bg-white dark:bg-[#1e1e24] rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-4 overflow-auto">
                                <pre className="text-sm font-mono text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{artifact.content}</pre>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
      </main>
    </div>
  );
}