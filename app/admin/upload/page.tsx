'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, ShieldAlert } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { supabase } from '../../supabaseClient'; // Pastikan path ini benar sesuai struktur folder lu

export default function AdminUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const router = useRouter();

  // 🛡️ SECURITY CHECK ON LOAD
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Area Terlarang: Login dulu bos!");
        router.push('/'); // Tendang ke Home
      } else {
        // Opsional: Cek email spesifik
        // if (session.user.email !== 'admin@zaidandigital.com') router.push('/');
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

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Upload failed');

      toast.success(`Sukses! ${data.chunks} data masuk ke otak AI.`);
      setFile(null); 
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Gagal upload.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthorized) {
      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">
            <Loader2 className="animate-spin" /> Verifying Access...
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <Toaster position="top-center" theme="dark" />
      
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        {/* Hiasan Background */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>

        <div className="flex items-center gap-3 mb-6 relative">
            <div className="w-12 h-12 bg-blue-600/20 rounded-2xl flex items-center justify-center text-blue-500">
                <ShieldAlert size={24} />
            </div>
            <div>
                <h1 className="text-xl font-bold">Admin Area</h1>
                <p className="text-xs text-zinc-400">Knowledge Base Manager</p>
            </div>
        </div>

        <div className="space-y-4 relative">
          <div className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${file ? 'border-blue-500/50 bg-blue-500/5' : 'border-zinc-800 hover:border-zinc-700'}`}>
            <input 
              type="file" 
              id="pdf-upload" 
              accept=".pdf" 
              onChange={handleFileChange} 
              className="hidden" 
            />
            
            <label htmlFor="pdf-upload" className="cursor-pointer flex flex-col items-center gap-3">
                {file ? (
                    <>
                        <FileText size={40} className="text-blue-400" />
                        <span className="text-sm font-medium text-blue-200">{file.name}</span>
                        <span className="text-xs text-zinc-500">Klik untuk ganti file</span>
                    </>
                ) : (
                    <>
                        <Upload size={40} className="text-zinc-600" />
                        <span className="text-sm text-zinc-400">Klik untuk pilih file PDF</span>
                        <span className="text-[10px] text-zinc-600">Max 10MB • PDF Only</span>
                    </>
                )}
            </label>
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                !file || loading 
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
            }`}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {loading ? 'Processing...' : 'Upload & Embed'}
          </button>
        </div>

        <div className="mt-6 pt-6 border-t border-zinc-800">
            <div className="flex gap-3 items-start bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
                <AlertCircle size={16} className="text-zinc-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Data yang diupload aman dan hanya bisa diakses oleh sistem AI Zaidan Digital untuk menjawab pertanyaan user.
                </p>
            </div>
        </div>
      </div>
    </div>
  );
}