
import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { QuestionCard } from './components/QuestionCard';
import { GameSession } from './components/GameSession';
import { Question, QuestionType, Topic, Difficulty, GenerationConfig } from './types';
import { generateQuestions, generateQuestionImage } from './services/geminiService';

interface HistoryItem {
  id: string;
  timestamp: number;
  config: GenerationConfig;
  questions: Question[];
}

export const App: React.FC = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isGameMode, setIsGameMode] = useState(false);
  
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  const [config, setConfig] = useState<GenerationConfig>({
    topic: Topic.BILANGAN,
    count: 5,
    type: QuestionType.MULTIPLE_CHOICE,
    difficulty: Difficulty.MEDIUM,
    includeImages: true,
    includeExplanation: true
  });

  // Theme Sync
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // History Load
  useEffect(() => {
    const savedHistory = localStorage.getItem('math_genius_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const saveToHistory = (newQuestions: Question[], currentConfig: GenerationConfig) => {
    const newItem: HistoryItem = {
      id: `history-${Date.now()}`,
      timestamp: Date.now(),
      config: { ...currentConfig },
      questions: newQuestions
    };
    
    const updatedHistory = [newItem, ...history].slice(0, 10); 
    setHistory(updatedHistory);

    try {
      const historyForStorage = updatedHistory.map(item => ({
        ...item,
        questions: item.questions.map(({ imageUrl, ...q }) => q) 
      }));
      localStorage.setItem('math_genius_history', JSON.stringify(historyForStorage));
    } catch (e) {
      console.warn("Could not save history to localStorage", e);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setQuestions([]);
    setShowAnswers(false);

    try {
      const baseQuestions = await generateQuestions(config);
      setQuestions(baseQuestions);

      let finalQuestions = [...baseQuestions];
      if (config.includeImages) {
        for (let i = 0; i < finalQuestions.length; i++) {
          // Add delay to avoid hitting rate limits (429 errors)
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 2000));

          const q = finalQuestions[i];
          if (q.imagePrompt) {
            const url = await generateQuestionImage(q.imagePrompt);
            if (url) {
              finalQuestions[i] = { ...q, imageUrl: url };
              setQuestions([...finalQuestions]);
            }
          }
        }
      }
      
      saveToHistory(finalQuestions, config);
    } catch (err: any) {
      console.error(err);
      setError("Gagal menghasilkan soal. Silakan coba lagi nanti.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportTXT = () => {
    if (questions.length === 0) return;

    let content = `LEMBAR LATIHAN SISWA - Simulasi TKA SD N NAWANGSARI\n`;
    content += `Materi: ${config.topic}\n`;
    content += `Tipe Soal: ${config.type}\n`;
    content += `Kesulitan: ${config.difficulty}\n`;
    content += `Tanggal: ${new Date().toLocaleDateString('id-ID')}\n`;
    content += `------------------------------------------\n\n`;

    questions.forEach((q, idx) => {
      content += `${idx + 1}. ${q.text}\n`;
      if (q.type === QuestionType.MULTIPLE_CHOICE && q.options) {
        q.options.forEach((opt, optIdx) => {
          content += `   ${String.fromCharCode(65 + optIdx)}. ${opt}\n`;
        });
      }
      content += `\n`;
    });

    if (showAnswers) {
      content += `------------------------------------------\n`;
      content += `KUNCI JAWABAN & PEMBAHASAN\n`;
      content += `------------------------------------------\n\n`;
      questions.forEach((q, idx) => {
        content += `Soal #${idx + 1}\n`;
        content += `Jawaban: ${q.answer}\n`;
        content += `Pembahasan: ${q.explanation}\n\n`;
      });
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `TKA_SD_N_NAWANGSARI_${config.topic.replace(/\s+/g, '_')}_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const loadFromHistory = (item: HistoryItem) => {
    setQuestions(item.questions);
    setConfig(item.config);
    setShowAnswers(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearHistory = () => {
    if (confirm("Hapus semua riwayat pengerjaan?")) {
      setHistory([]);
      localStorage.removeItem('math_genius_history');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleString('id-ID', { 
      day: 'numeric', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (isGameMode) {
    return (
      <Layout darkMode={darkMode} setDarkMode={setDarkMode}>
        <GameSession 
          onExit={() => setIsGameMode(false)} 
          config={config} 
          setConfig={setConfig} 
        />
      </Layout>
    );
  }

  return (
    <Layout darkMode={darkMode} setDarkMode={setDarkMode}>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar / Config - Hidden in print */}
        <div className="lg:col-span-1 space-y-6 no-print">
          {/* Main Config */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors duration-200">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Pengaturan Soal
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Topik Materi</label>
                <select 
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  value={config.topic}
                  onChange={(e) => setConfig({...config, topic: e.target.value as Topic})}
                >
                  {Object.values(Topic).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Tingkat Kesulitan</label>
                <select 
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  value={config.difficulty}
                  onChange={(e) => setConfig({...config, difficulty: e.target.value as Difficulty})}
                >
                  {Object.values(Difficulty).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Jumlah Soal</label>
                <input 
                  type="number" 
                  min="1" 
                  max="10" 
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  value={config.count}
                  onChange={(e) => setConfig({...config, count: parseInt(e.target.value) || 1})}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Tipe Soal</label>
                <select 
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  value={config.type}
                  onChange={(e) => setConfig({...config, type: e.target.value as QuestionType})}
                >
                  {Object.values(QuestionType).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-700/50">
                <div className="flex items-center gap-3 py-2">
                  <input 
                    type="checkbox" 
                    id="includeImages"
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                    checked={config.includeImages}
                    onChange={(e) => setConfig({...config, includeImages: e.target.checked})}
                  />
                  <label htmlFor="includeImages" className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">Sertakan Gambar AI</label>
                </div>
                
                <div className="flex items-center gap-3 py-2">
                  <input 
                    type="checkbox" 
                    id="includeExplanation"
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                    checked={config.includeExplanation}
                    onChange={(e) => setConfig({...config, includeExplanation: e.target.checked})}
                  />
                  <label htmlFor="includeExplanation" className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">Sertakan Pembahasan Detail</label>
                </div>
              </div>

              <button 
                onClick={handleGenerate}
                disabled={loading}
                className={`w-full py-3 px-4 rounded-xl font-bold text-white transition-all shadow-md ${
                  loading 
                    ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed text-slate-500' 
                    : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 active:transform active:scale-95'
                }`}
              >
                {loading ? 'Menghasilkan...' : 'Generate Soal'}
              </button>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
               <button 
                 onClick={() => setIsGameMode(true)}
                 className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-md shadow-purple-500/20 transition-all flex items-center justify-center gap-2 animate-pulse hover:animate-none"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                 </svg>
                 Mode Game Online
               </button>
            </div>
          </div>

          {/* Action Buttons for current questions */}
          {questions.length > 0 && (
            <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl space-y-3 transition-colors duration-200">
              <button 
                onClick={() => setShowAnswers(!showAnswers)}
                className="w-full py-2.5 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {showAnswers ? 'Sembunyikan Kunci' : 'Lihat Kunci Jawaban'}
              </button>
              
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={handlePrint}
                  className="py-2.5 px-3 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-1 shadow-lg shadow-blue-500/20"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  PDF
                </button>
                <button 
                  onClick={handleExportTXT}
                  className="py-2.5 px-3 bg-slate-700 dark:bg-slate-600 text-white rounded-lg text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-500 transition-colors flex items-center justify-center gap-1 shadow-lg shadow-slate-500/10"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export (.txt)
                </button>
              </div>
            </div>
          )}

          {/* History Section */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors duration-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Riwayat
              </h2>
              {history.length > 0 && (
                <button 
                  onClick={clearHistory}
                  className="text-[10px] text-red-500 hover:text-red-600 font-bold uppercase transition-colors"
                >
                  Hapus
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Belum ada riwayat soal.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => loadFromHistory(item)}
                    className="w-full text-left p-3 rounded-xl border border-transparent hover:border-blue-200 dark:hover:border-blue-900 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate max-w-[120px]">
                        {item.config.topic}
                      </span>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">
                        {formatTimestamp(item.timestamp)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 flex gap-2">
                      <span>{item.config.count} Soal</span>
                      <span>•</span>
                      <span>{item.config.type}</span>
                    </div>
                    {item.config.difficulty && (
                      <div className="text-[9px] text-slate-400 mt-0.5">
                        {item.config.difficulty.split(' ')[0]}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 p-4 rounded-xl mb-6">
              {error}
            </div>
          )}

          {loading && questions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="w-16 h-16 border-4 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin"></div>
              <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Sedang Meramu Soal Terbaik...</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-2">AI sedang menyusun soal matematika yang menantang dan relevan.</p>
              </div>
            </div>
          )}

          {!loading && questions.length === 0 && !error && (
            <div className="bg-white dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl p-12 text-center flex flex-col items-center transition-colors duration-200">
              <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-white">Siap Belajar?</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-sm">
                Atur topik atau pilih dari <strong>Riwayat</strong> di sidebar untuk mulai berlatih.
              </p>
            </div>
          )}

          <div id="print-area">
            {/* Header for printing only */}
            <div className="hidden print:block mb-10 pb-6 border-b-4 border-double border-slate-900">
              <div className="flex justify-between items-center mb-6">
                <div className="text-left">
                  <h1 className="text-2xl font-black uppercase tracking-tighter">LEMBAR LATIHAN SISWA</h1>
                  <p className="text-sm font-bold text-slate-600">Generated by AI - SD N NAWANGSARI</p>
                </div>
                <div className="text-right border-2 border-slate-900 p-2 text-xs font-bold uppercase">
                  Mata Pelajaran: Matematika<br/>
                  Tingkat: SD Kelas 6<br/>
                  Kesulitan: {config.difficulty ? config.difficulty.split(' ')[0] : 'Umum'}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm font-medium">
                <div className="border-b border-slate-400 pb-1">Nama : _________________________</div>
                <div className="border-b border-slate-400 pb-1">Materi : {config.topic}</div>
                <div className="border-b border-slate-400 pb-1">Kelas : _________________________</div>
                <div className="border-b border-slate-400 pb-1">Waktu : 60 Menit</div>
                <div className="border-b border-slate-400 pb-1">No. Absen : _____________________</div>
                <div className="border-b border-slate-400 pb-1">Tanggal : {new Date().toLocaleDateString('id-ID')}</div>
              </div>
              
              <div className="mt-8 p-3 bg-slate-100 border border-slate-300 text-center text-xs italic">
                Petunjuk: Kerjakan soal-soal di bawah ini dengan teliti. Tuliskan jawaban pada tempat yang tersedia.
              </div>
            </div>

            {questions.map((q, index) => (
              <QuestionCard 
                key={q.id} 
                question={q} 
                number={index + 1} 
                showAnswer={showAnswers} 
              />
            ))}

            {/* Print-only footer for Answer Key on separate page if needed */}
            {questions.length > 0 && showAnswers && (
              <div className="hidden print:block page-break-before mt-10">
                <h2 className="text-xl font-bold uppercase border-b-2 border-slate-900 pb-2 mb-6 text-center">
                  KUNCI JAWABAN & PEMBAHASAN
                </h2>
                <div className="space-y-4">
                  {questions.map((q, idx) => (
                    <div key={`ans-${q.id}`} className="p-4 border border-slate-200 rounded-lg break-inside-avoid">
                      <div className="font-bold text-lg mb-1">Soal #{idx + 1}</div>
                      <div className="font-bold text-blue-700 mb-2">Jawaban: {q.answer}</div>
                      <div className="text-sm text-slate-700 leading-relaxed italic">
                        <strong>Pembahasan:</strong> {q.explanation}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {loading && questions.length > 0 && (
              <div className="p-4 text-center text-slate-400 dark:text-slate-600 animate-pulse no-print">
                Menghasilkan lebih banyak soal...
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};
