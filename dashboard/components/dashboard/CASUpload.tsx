'use client';

import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, X, Eye, EyeOff } from 'lucide-react';

interface UploadResult {
  stocksParsed: number;
  mutualFundsParsed: number;
  unmappedIsins: number;
  statementDate: string | null;
  updatedAt: string;
}

interface Props {
  onSuccess?: () => void;
}

export default function CASUpload({ onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setPassword('');
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('password', password);

    try {
      const res = await fetch('/api/cas/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        const baseMsg = data.error ?? `Upload failed (${res.status})`;
        throw new Error(data.detail ? `${baseMsg}: ${data.detail}` : baseMsg);
      }
      setResult(data);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true); }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-500 border border-white/12 bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all"
      >
        <Upload className="w-4 h-4" />
        Upload CAS
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md glass-card border border-white/12 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-primary" />
                <span className="font-600 text-sm text-foreground">Import NSDL CAS</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              {/* File picker */}
              {!result && (
                <>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5 font-500">CAS PDF file</label>
                    <div
                      className="border-2 border-dashed border-white/12 rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
                      onClick={() => fileRef.current?.click()}
                    >
                      {file ? (
                        <div className="flex items-center justify-center gap-2 text-sm text-foreground">
                          <FileText className="w-4 h-4 text-primary" />
                          <span className="font-500">{file.name}</span>
                          <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          <Upload className="w-5 h-5 mx-auto mb-2 opacity-50" />
                          Click to select NSDL CAS PDF
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={e => setFile(e.target.files?.[0] ?? null)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5 font-500">
                      PDF password <span className="opacity-60">(usually first 5 letters of PAN + DOB in DDMMYYYY)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="e.g. ABCDE01011990"
                        className="w-full px-3 py-2 pr-10 rounded-lg bg-secondary/50 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleUpload}
                    disabled={!file || uploading}
                    className="w-full py-2.5 rounded-lg text-sm font-600 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {uploading ? 'Parsing & importing…' : 'Import CAS'}
                  </button>
                </>
              )}

              {/* Success */}
              {result && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-600 text-sm">Import successful</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label="Stocks imported" value={result.stocksParsed} />
                    <Stat label="Mutual funds" value={result.mutualFundsParsed} />
                    {result.unmappedIsins > 0 && (
                      <Stat label="Unmapped ISINs" value={result.unmappedIsins} warn />
                    )}
                    {result.statementDate && (
                      <Stat label="Statement date" value={result.statementDate} />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={reset}
                      className="flex-1 py-2 rounded-lg text-sm border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                    >
                      Import another
                    </button>
                    <button
                      onClick={() => setOpen(false)}
                      className="flex-1 py-2 rounded-lg text-sm bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-500"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-secondary/40 border border-white/8 px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-700 mt-0.5 ${warn ? 'text-yellow-400' : 'text-foreground'}`}>{value}</div>
    </div>
  );
}
