'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, CheckCircle, Loader2, Type, FileUp, AlertCircle, X, Sparkles } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { supabase } from '../../supabaseClient';

export default function AdminUpload() {
  const [mode, setMode] = useState<'file' | 'text'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Access Denied");
        router.push('/'); 
      } else {
        setIsAuthorized(true);
      }
    };
    checkUser();
  }, [router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const removeFile = (e: React.MouseEvent) => {
    e.preventDefault();
    setFile(null);
  };

  const handleUpload = async () => {
    if (mode === 'file' && !file) return;
    if (mode === 'text' && (!textInput || !titleInput)) {
        toast.error("Please fill in all text fields");
        return;
    }

    setLoading(true);
    const formData = new FormData();

    if (mode === 'file' && file) {
        formData.append('file', file);
    } else if (mode === 'text') {
        formData.append('text', textInput);
        formData.append('title', titleInput);
    }

    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        body: formData,
      });

      const responseText = await res.text();
      let data;
      
      try {
        data = JSON.parse(responseText);
      } catch (err) {
        console.error("JSON Parse Error:", err); 
        console.error("Raw Server Response:", responseText);
        throw new Error("Server Error: Timeout or invalid response format.");
      }

      if (!res.ok) throw new Error(data.error || 'Upload failed');

      toast.success(`Success! ${data.chunks} chunks embedded.`);
      
      setFile(null);
      setTextInput('');
      setTitleInput('');
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthorized) {
      return (
        <div className="min-h-screen bg-[#050505] flex items-center justify-center text-zinc-500">
            <Loader2 className="animate-spin mr-2" /> Verifying Access...
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-4 relative overflow-hidden font-sans selection:bg-blue-500/30">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px]"></div>
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-blue-900/5 via-transparent to-transparent pointer-events-none"></div>
      <div className="absolute top-10 left-10 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px]"></div>
      <div className="absolute bottom-10 right-10 w-64 h-64 bg-violet-500/10 rounded-full blur-[100px]"></div>

      <Toaster position="top-center" theme="dark" />
      
      <div className="w-full max-w-xl bg-zinc-900/60 backdrop-blur-2xl border border-white/5 rounded-3xl p-8 shadow-2xl relative z-10 ring-1 ring-white/10">
        
        <div className="flex items-center gap-5 mb-8 border-b border-white/5 pb-6">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-violet-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/30 ring-1 ring-white/20">
                <Sparkles size={26} className="text-white fill-white/20" />
            </div>
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                    Knowledge Base
                </h1>
                <p className="text-sm text-zinc-400 mt-1">Train your AI with new data</p>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-1 bg-black/40 p-1.5 rounded-xl mb-8 border border-white/5">
            <button 
                onClick={() => setMode('file')}
                className={`py-2.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-300 ${
                    mode === 'file' 
                    ? 'bg-zinc-800 text-white shadow-lg ring-1 ring-white/10' 
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                }`}
            >
                <FileUp size={14} /> Upload PDF
            </button>
            <button 
                onClick={() => setMode('text')}
                className={`py-2.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-300 ${
                    mode === 'text' 
                    ? 'bg-zinc-800 text-white shadow-lg ring-1 ring-white/10' 
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                }`}
            >
                <Type size={14} /> Manual Input
            </button>
        </div>

        <div className="space-y-6">
          {mode === 'file' && (
            <div className={`relative group border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 ${
                file 
                ? 'border-blue-500/40 bg-blue-500/5' 
                : 'border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/30'
            }`}>
                <input 
                    type="file" 
                    id="pdf-upload" 
                    accept=".pdf" 
                    onChange={handleFileChange} 
                    className="hidden" 
                />
                
                {file ? (
                     <div className="relative z-10 animate-in fade-in zoom-in-95 duration-300">
                        <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-500/20 to-violet-500/20 rounded-2xl flex items-center justify-center mb-4 ring-1 ring-white/10">
                            <FileText size={36} className="text-blue-400" />
                        </div>
                        <p className="text-base font-medium text-white truncate max-w-[250px] mx-auto">{file.name}</p>
                        <p className="text-xs text-blue-300/70 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        
                        <button 
                            onClick={removeFile}
                            className="absolute -top-5 -right-5 bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 border border-zinc-700 rounded-full p-2 transition-all shadow-lg"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ) : (
                    <label htmlFor="pdf-upload" className="cursor-pointer flex flex-col items-center gap-4 w-full h-full justify-center">
                        <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800 group-hover:scale-110 group-hover:border-blue-500/50 transition-all duration-300 shadow-xl">
                            <Upload size={32} className="text-zinc-500 group-hover:text-blue-400 transition-colors" />
                        </div>
                        <div>
                            <span className="text-base text-zinc-300 font-medium group-hover:text-white transition-colors">Click to upload Document</span>
                            <p className="text-xs text-zinc-500 mt-1.5">Max 10MB • PDF Format Only</p>
                        </div>
                    </label>
                )}
            </div>
          )}

          {mode === 'text' && (
            <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
                <div className="space-y-2">
                    <label className="text-xs text-zinc-400 font-medium ml-1 uppercase tracking-wider">Title / Topic</label>
                    <input 
                        type="text" 
                        placeholder="e.g. Q1 Financial Report"
                        value={titleInput}
                        onChange={(e) => setTitleInput(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all shadow-inner"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-xs text-zinc-400 font-medium ml-1 uppercase tracking-wider">Content Data</label>
                    <textarea 
                        placeholder="Paste the relevant information here..."
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        rows={6}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all resize-none leading-relaxed shadow-inner"
                    />
                </div>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={loading || (mode === 'file' && !file) || (mode === 'text' && (!textInput || !titleInput))}
            className={`w-full py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-300 transform active:scale-[0.99] ${
                loading || (mode === 'file' && !file) || (mode === 'text' && (!textInput || !titleInput))
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5' 
                : 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white shadow-lg shadow-blue-500/20 border border-white/10'
            }`}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
            {loading ? 'Processing Data...' : 'Embed to Memory'}
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-white/5">
            <div className="flex gap-4 items-center bg-blue-500/5 p-4 rounded-xl border border-blue-500/10">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                    <AlertCircle size={16} className="text-blue-400" />
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Data is encrypted and stored in Supabase Vector Store. 
                    The AI uses RAG (Retrieval-Augmented Generation) to access this context.
                </p>
            </div>
        </div>

      </div>
    </div>
  );
}