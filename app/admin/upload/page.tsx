'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, CheckCircle, Loader2, ShieldAlert, Type, FileUp, AlertCircle, X } from 'lucide-react';
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

  // 🛡️ AUTH CHECK
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

  // 🚀 UPLOAD LOGIC (ROBUST VERSION)
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
        throw new Error("Server Error: Mungkin Timeout atau File terlalu besar.");
      }

      if (!res.ok) throw new Error(data.error || 'Upload failed');

      toast.success(`Success! ${data.chunks} chunks embedded.`);
      
      // Reset Form
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
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-zinc-500">
            <Loader2 className="animate-spin mr-2" /> Verifying Access...
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      <div className="absolute top-0 left-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px]"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px]"></div>

      <Toaster position="top-center" theme="dark" />
      
      <div className="w-full max-w-lg bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/60 rounded-3xl p-8 shadow-2xl relative z-10">
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/20">
                <ShieldAlert size={24} className="text-white" />
            </div>
            <div>
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
                    Knowledge Base
                </h1>
                <p className="text-xs text-zinc-400 font-medium">Manage AI Context & Memory</p>
            </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex bg-zinc-950/40 p-1.5 rounded-xl mb-6 border border-zinc-800/50">
            <button 
                onClick={() => setMode('file')}
                className={`flex-1 py-2.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-300 ${
                    mode === 'file' 
                    ? 'bg-zinc-800 text-white shadow-md border border-zinc-700/50' 
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
                }`}
            >
                <FileUp size={14} /> Upload PDF
            </button>
            <button 
                onClick={() => setMode('text')}
                className={`flex-1 py-2.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-300 ${
                    mode === 'text' 
                    ? 'bg-zinc-800 text-white shadow-md border border-zinc-700/50' 
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
                }`}
            >
                <Type size={14} /> Manual Input
            </button>
        </div>

        {/* Input Area */}
        <div className="space-y-5">
          
          {/* File Mode */}
          {mode === 'file' && (
            <div className={`relative group border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 ${
                file 
                ? 'border-blue-500/30 bg-blue-500/5' 
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
                     <div className="relative z-10">
                        <div className="w-16 h-16 mx-auto bg-blue-500/20 rounded-2xl flex items-center justify-center mb-3">
                            <FileText size={32} className="text-blue-400" />
                        </div>
                        <p className="text-sm font-medium text-blue-100 truncate max-w-[200px] mx-auto">{file.name}</p>
                        <p className="text-xs text-blue-300/60 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        
                        <button 
                            onClick={removeFile}
                            className="absolute -top-4 -right-4 bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 border border-zinc-700 rounded-full p-1.5 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>
                ) : (
                    <label htmlFor="pdf-upload" className="cursor-pointer flex flex-col items-center gap-3 w-full h-full justify-center">
                        <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                            <Upload size={28} className="text-zinc-400 group-hover:text-white" />
                        </div>
                        <div>
                            <span className="text-sm text-zinc-300 font-medium group-hover:text-white transition-colors">Click to upload PDF</span>
                            <p className="text-[10px] text-zinc-500 mt-1">Max 10MB • Vector Embedding Ready</p>
                        </div>
                    </label>
                )}
            </div>
          )}

          {/* Text Mode */}
          {mode === 'text' && (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400 font-medium ml-1">Title / Context</label>
                    <input 
                        type="text" 
                        placeholder="e.g. Service Pricing 2025"
                        value={titleInput}
                        onChange={(e) => setTitleInput(e.target.value)}
                        className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400 font-medium ml-1">Knowledge Content</label>
                    <textarea 
                        placeholder="Paste your knowledge base content here..."
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        rows={6}
                        className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all resize-none leading-relaxed"
                    />
                </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleUpload}
            disabled={loading || (mode === 'file' && !file) || (mode === 'text' && (!textInput || !titleInput))}
            className={`w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-300 transform active:scale-[0.98] ${
                loading || (mode === 'file' && !file) || (mode === 'text' && (!textInput || !titleInput))
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700' 
                : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-500/20 border border-blue-500/50'
            }`}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
            {loading ? 'Embedding...' : 'Save to Memory'}
          </button>
        </div>

        {/* Footer Info */}
        <div className="mt-8 pt-6 border-t border-zinc-800/50">
            <div className="flex gap-3 items-start bg-blue-500/5 p-4 rounded-xl border border-blue-500/10">
                <AlertCircle size={16} className="text-blue-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Data is securely encrypted and stored in Supabase Vector Store. 
                    The AI will use RAG (Retrieval-Augmented Generation) to access this context during conversations.
                </p>
            </div>
        </div>

      </div>
    </div>
  );
}