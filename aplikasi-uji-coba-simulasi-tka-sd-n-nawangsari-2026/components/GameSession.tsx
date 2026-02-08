import React, { useState, useEffect, useRef } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { Question, QuestionType, GameState, Player, GenerationConfig, Topic, Difficulty, GamePacket } from '../types';
import { generateQuestions, generateQuestionImage } from '../services/geminiService';

interface GameSessionProps {
  onExit: () => void;
  config: GenerationConfig;
  setConfig: (c: GenerationConfig) => void;
}

// Helper to generate a short 5-character ID
const generateRoomId = () => {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
};

export const GameSession: React.FC<GameSessionProps> = ({ onExit, config, setConfig }) => {
  const [mode, setMode] = useState<'MENU' | 'HOST' | 'JOIN'>('MENU');
  const [gameState, setGameState] = useState<GameState>(GameState.SETUP);
  const [roomId, setRoomId] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [myScore, setMyScore] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  // Host state
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<Topic[]>([Object.values(Topic)[0]]); // Default select first topic
  const [includeImages, setIncludeImages] = useState(false);
  const [includeExplanation, setIncludeExplanation] = useState(true);
  
  // Password State
  const [showHostPasswordInput, setShowHostPasswordInput] = useState(false);
  const [hostPasswordInput, setHostPasswordInput] = useState('');

  // Refs for PeerJS
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<DataConnection[]>([]);
  const hostConnRef = useRef<DataConnection | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      peerRef.current?.destroy();
    };
  }, []);

  // Centralized Error Handler for PeerJS
  const handlePeerError = (err: any) => {
    console.error("PeerJS Error:", err);
    let msg = "Terjadi kesalahan koneksi.";
    
    switch (err.type) {
      case 'peer-unavailable':
        msg = "Room ID tidak ditemukan. Pastikan Kode Room benar dan Guru (Host) sedang online di Lobby.";
        // Reset to menu if we fail to connect to a peer
        if (mode === 'JOIN') {
            setMode('MENU');
            setGameState(GameState.SETUP);
        }
        break;
      case 'unavailable-id':
        msg = "ID Room sedang sibuk atau sudah digunakan. Silakan coba lagi.";
        break;
      case 'network':
      case 'disconnected':
      case 'server-error':
      case 'socket-error':
      case 'socket-closed':
        msg = "Masalah jaringan. Periksa koneksi internet atau firewall Anda.";
        break;
      case 'browser-incompatible':
        msg = "Browser Anda tidak mendukung fitur multiplayer ini. Gunakan Chrome/Firefox/Edge terbaru.";
        break;
      case 'invalid-id':
        msg = "Format Kode Room tidak valid.";
        break;
      case 'webrtc':
        msg = "Gagal inisialisasi WebRTC. Coba refresh halaman.";
        break;
      default:
        msg = `Koneksi Error: ${err.message || err.type || 'Unknown'}`;
    }
    
    setErrorMsg(msg);
    setStatusMsg("");
  };

  // --- HOST LOGIC ---

  const initHost = () => {
    try {
      const newRoomId = generateRoomId();
      
      // PeerJS Initialization Fix for ESM/Bundlers
      // @ts-ignore
      const PeerClass = Peer.default || Peer;
      const peer = new PeerClass(newRoomId); 
      
      peer.on('open', (id: string) => {
        setStatusMsg(`Room dibuka: ${id}`);
        setRoomId(id);
        setMode('HOST');
        setGameState(GameState.LOBBY);
        setPlayerName('GURU (daniswara)');
        // Add Host to players list
        setPlayers([{ id: 'HOST', name: 'GURU (daniswara)', score: 0, isHost: true }]);
      });

      peer.on('connection', (conn: DataConnection) => {
        // Limit to 10 players
        if (connectionsRef.current.length >= 10) {
          conn.send({ type: 'KICK', payload: 'Room Penuh (Maks 10)' });
          setTimeout(() => conn.close(), 500);
          return;
        }

        connectionsRef.current.push(conn);

        conn.on('data', (data: any) => {
          handleHostData(conn, data);
        });

        conn.on('close', () => {
          connectionsRef.current = connectionsRef.current.filter(c => c.peer !== conn.peer);
          setPlayers(prev => {
             const updated = prev.filter(p => p.id !== conn.peer);
             broadcastPlayers(updated); // Ensure clients get the removal update immediately
             return updated;
          });
        });
        
        conn.on('error', (err: any) => {
             console.error("Connection Error:", err);
             // Usually peer.on('error') catches these, but good to have
        });
      });

      peer.on('error', (err: any) => {
        handlePeerError(err);
      });

      peerRef.current = peer;
    } catch (e: any) {
      console.error(e);
      setErrorMsg("Gagal inisialisasi Peer: " + e.message);
    }
  };

  const handleHostData = (conn: DataConnection, data: GamePacket) => {
    if (data.type === 'JOIN') {
      const newPlayer: Player = {
        id: conn.peer,
        name: data.payload.name || `Player ${conn.peer.substring(0,4)}`,
        score: 0,
        isHost: false
      };
      setPlayers(prev => {
        // Prevent duplicate joins
        if (prev.some(p => p.id === newPlayer.id)) return prev;
        
        const updated = [...prev, newPlayer];
        setTimeout(() => broadcastPlayers(updated), 100);
        return updated;
      });
    } else if (data.type === 'SUBMIT_SCORE') {
      setPlayers(prev => {
        const updated = prev.map(p => p.id === conn.peer ? { ...p, score: data.payload.score } : p);
        broadcastPlayers(updated); // Live leaderboard update
        return updated;
      });
    }
  };

  const broadcastPlayers = (currentPlayers = players) => {
    const packet: GamePacket = { type: 'UPDATE_PLAYERS', payload: currentPlayers };
    connectionsRef.current.forEach(conn => conn.send(packet));
  };

  const broadcastGameStart = (gameQuestions: Question[]) => {
    const packet: GamePacket = { type: 'START_GAME', payload: gameQuestions };
    connectionsRef.current.forEach(conn => conn.send(packet));
  };

  const broadcastResetLobby = () => {
    const packet: GamePacket = { type: 'RESET_LOBBY', payload: null };
    connectionsRef.current.forEach(conn => conn.send(packet));
  };

  const movePlayer = (index: number, direction: 'up' | 'down') => {
    if (mode !== 'HOST') return;
    
    const newPlayers = [...players];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    // Bounds check
    if (targetIndex < 0 || targetIndex >= newPlayers.length) return;

    // Swap
    [newPlayers[index], newPlayers[targetIndex]] = [newPlayers[targetIndex], newPlayers[index]];

    setPlayers(newPlayers);
    broadcastPlayers(newPlayers);
  };

  const resetScores = () => {
    if (window.confirm("Apakah Anda yakin ingin mereset skor semua pemain (termasuk Host) menjadi 0?")) {
      setPlayers(prev => {
        const updated = prev.map(p => ({ ...p, score: 0 }));
        broadcastPlayers(updated);
        return updated;
      });
      setMyScore(0);
    }
  };

  const handlePlayAgain = () => {
    // 1. Reset Host State
    setGameState(GameState.LOBBY);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setMyScore(0);
    
    // Reset answer states
    setSelectedOption(null);
    setIsAnswered(false);
    setIsCorrect(false);
    
    // 2. Reset Player Scores (Host side)
    const resetPlayers = players.map(p => ({ ...p, score: 0 }));
    setPlayers(resetPlayers);
    
    // 3. Broadcast update
    broadcastPlayers(resetPlayers);
    broadcastResetLobby();
  };

  const toggleTopic = (topic: Topic) => {
    setSelectedTopics(prev => {
      if (prev.includes(topic)) {
        // Don't allow deselecting the last one
        if (prev.length === 1) return prev;
        return prev.filter(t => t !== topic);
      } else {
        return [...prev, topic];
      }
    });
  };

  const handleGenerateAndStart = async () => {
    if (selectedTopics.length === 0) {
      alert("Pilih minimal satu topik!");
      return;
    }

    setIsGenerating(true);
    setStatusMsg("Sedang membuat naskah soal...");

    try {
      // Combine multiple topics into a string for the prompt
      const combinedTopics = selectedTopics.join(', ');

      // Force settings suitable for game
      const gameConfig = { 
        ...config, 
        topic: combinedTopics as any, // Bypass enum check to send multiple topics string
        includeImages: includeImages, 
        includeExplanation: includeExplanation,
        count: config.count, // Use the config count set in UI
        type: QuestionType.MULTIPLE_CHOICE // Force MC for game mode
      }; 
      const generated = await generateQuestions(gameConfig);

      // Handle Image Generation
      if (includeImages) {
        for (let i = 0; i < generated.length; i++) {
          if (generated[i].imagePrompt) {
            // Add delay to prevent rate limiting (429)
            if (i > 0) await new Promise(r => setTimeout(r, 2000));
            
            setStatusMsg(`Menggambar ilustrasi soal ${i + 1}/${generated.length}...`);
            try {
              const url = await generateQuestionImage(generated[i].imagePrompt!);
              if (url) {
                generated[i].imageUrl = url;
              }
            } catch (err) {
              console.error("Gagal generate gambar:", err);
            }
          }
        }
      }

      setQuestions(generated);
      
      setStatusMsg("Mengirim data ke pemain...");
      broadcastGameStart(generated);
      
      setGameState(GameState.PLAYING);
      // Reset Host Score
      setMyScore(0);
      setCurrentQuestionIndex(0);
      
      // Reset answer states just in case
      setSelectedOption(null);
      setIsAnswered(false);
      setIsCorrect(false);
      
    } catch (e) {
      console.error(e);
      setErrorMsg("Gagal membuat soal AI. Coba lagi.");
      setStatusMsg("");
    } finally {
      setIsGenerating(false);
    }
  };

  // --- CLIENT LOGIC ---

  const joinGame = () => {
    if (!roomId || !playerName) {
      setErrorMsg("Isi Room ID dan Nama");
      return;
    }
    
    setMode('JOIN');
    setStatusMsg("Menghubungkan ke Room...");
    
    try {
      // PeerJS Initialization Fix for ESM/Bundlers
      // @ts-ignore
      const PeerClass = Peer.default || Peer;
      const peer = new PeerClass();
      
      peer.on('open', (id: string) => {
        const conn = peer.connect(roomId.toUpperCase());
        
        conn.on('open', () => {
          setStatusMsg("Terhubung! Menunggu Host...");
          setGameState(GameState.LOBBY);
          hostConnRef.current = conn;
          // Send Join info
          conn.send({ type: 'JOIN', payload: { name: playerName } });
        });

        conn.on('data', (data: any) => handleClientData(data));
        
        conn.on('close', () => {
          setErrorMsg("Koneksi ke Host terputus.");
          setGameState(GameState.SETUP);
        });
        
        conn.on('error', (err: any) => {
            console.error("Connection Error:", err);
            handlePeerError(err);
        });
      });
      
      peer.on('error', (err: any) => {
          handlePeerError(err);
      });
      
      peerRef.current = peer;
    } catch (e: any) {
      setErrorMsg("Gagal inisialisasi Peer Client: " + e.message);
    }
  };

  const handleClientData = (data: GamePacket) => {
    if (data.type === 'UPDATE_PLAYERS') {
      setPlayers(data.payload);
    } else if (data.type === 'START_GAME') {
      setQuestions(data.payload);
      setGameState(GameState.PLAYING);
      setMyScore(0);
      setCurrentQuestionIndex(0);
      
      // Reset answer states
      setSelectedOption(null);
      setIsAnswered(false);
      setIsCorrect(false);
      
    } else if (data.type === 'KICK') {
      setErrorMsg(data.payload);
      peerRef.current?.destroy();
      setMode('MENU');
    } else if (data.type === 'RESET_LOBBY') {
      setGameState(GameState.LOBBY);
      setQuestions([]);
      setCurrentQuestionIndex(0);
      setMyScore(0);
      
      // Reset answer states
      setSelectedOption(null);
      setIsAnswered(false);
      setIsCorrect(false);
      
      setStatusMsg("Menunggu Host memulai permainan baru...");
    }
  };

  const submitScore = (score: number) => {
    setMyScore(score);
    if (mode === 'HOST') {
        // Host updates their own score locally and broadcasts
        setPlayers(prev => {
            const updated = prev.map(p => p.id === 'HOST' ? { ...p, score: score } : p);
            broadcastPlayers(updated);
            return updated;
        });
    } else if (hostConnRef.current) {
      // Client sends score to host
      hostConnRef.current.send({ type: 'SUBMIT_SCORE', payload: { score } });
    }
  };
  
  const verifyHostPassword = () => {
      if (hostPasswordInput === 'danis123') {
          initHost();
          setShowHostPasswordInput(false);
          setHostPasswordInput('');
          setErrorMsg('');
      } else {
          setErrorMsg("Password Salah!");
      }
  };

  // --- GAMEPLAY UI COMPONENTS ---

  const renderMainMenu = () => (
    <div className="max-w-md mx-auto space-y-6 animate-fade-in">
      <div className="text-center mb-8">
        <div className="bg-purple-100 dark:bg-purple-900/30 p-4 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Simulasi TKA SD N NAWANGSARI</h2>
        <p className="text-slate-500 dark:text-slate-400">Game Kuis Matematika Multiplayer Real-time</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {!showHostPasswordInput ? (
          <button 
            onClick={() => { setShowHostPasswordInput(true); setErrorMsg(''); }}
            className="p-6 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-2xl hover:shadow-lg transform hover:-translate-y-1 transition-all text-left group"
          >
            <div className="font-bold text-lg mb-1">Buat Room (Guru)</div>
            <div className="text-blue-100 text-sm">Generate soal dan pandu permainan untuk siswa.</div>
          </button>
        ) : (
          <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-blue-200 dark:border-blue-900 shadow-sm animate-fade-in">
             <h3 className="font-bold text-slate-800 dark:text-white mb-3">Verifikasi Guru</h3>
             <input 
               type="password" 
               className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-3 outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-colors"
               placeholder="Masukkan Password..."
               value={hostPasswordInput}
               onChange={(e) => setHostPasswordInput(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && verifyHostPassword()}
               autoFocus
             />
             <div className="flex gap-2">
               <button 
                 onClick={() => { setShowHostPasswordInput(false); setHostPasswordInput(''); setErrorMsg(''); }}
                 className="flex-1 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
               >
                 Batal
               </button>
               <button 
                 onClick={verifyHostPassword}
                 className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors"
               >
                 Masuk
               </button>
             </div>
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Nama Siswa</label>
          <input 
            type="text" 
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Masukkan Nama Kamu"
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-4 outline-none focus:ring-2 focus:ring-purple-500 dark:text-white"
          />
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Kode Room</label>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              placeholder="CTH: AB123"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-mono uppercase tracking-widest outline-none focus:ring-2 focus:ring-purple-500 dark:text-white"
            />
            <button 
              onClick={joinGame}
              disabled={!roomId || !playerName}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white px-6 rounded-xl font-bold transition-colors"
            >
              Join
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderLobby = () => (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-lg text-center">
        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
            Lobby Game
          </span>
          {mode === 'HOST' && players.length > 0 && (
            <button 
              onClick={resetScores}
              className="text-xs text-red-500 hover:text-red-600 font-bold underline decoration-red-200 hover:decoration-red-500 underline-offset-4 transition-all"
            >
               Reset Skor Semua Pemain
            </button>
          )}
        </div>
        
        <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-2">{roomId}</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">Bagikan kode ini ke siswa untuk bergabung (Maks 10)</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {players.map((p, idx) => (
            <div key={p.id} className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center gap-2 animate-pop-in relative group">
              <div className={`w-2 h-2 rounded-full ${p.isHost ? 'bg-blue-500' : 'bg-green-500'}`}></div>
              <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm truncate">{p.name}</span>
              
              {mode === 'HOST' && players.length > 1 && (
                <div className="flex items-center gap-1 ml-auto pl-2 border-l border-slate-200 dark:border-slate-700 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={(e) => { e.stopPropagation(); movePlayer(idx, 'up'); }}
                        disabled={idx === 0}
                        className="w-6 h-6 flex items-center justify-center bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 rounded shadow-sm text-[10px] text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Geser Naik"
                    >
                        ‚ñ≤
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); movePlayer(idx, 'down'); }}
                        disabled={idx === players.length - 1}
                        className="w-6 h-6 flex items-center justify-center bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 rounded shadow-sm text-[10px] text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Geser Turun"
                    >
                        ‚ñº
                    </button>
                </div>
              )}
            </div>
          ))}
          {Array.from({ length: Math.max(0, 10 - players.length) }).map((_, i) => (
            <div key={i} className="bg-slate-50/50 dark:bg-slate-900/20 p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center">
              <span className="text-xs text-slate-300 dark:text-slate-700 font-medium">Menunggu...</span>
            </div>
          ))}
        </div>

        {mode === 'HOST' ? (
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-left">
            <h3 className="font-bold text-slate-700 dark:text-slate-300 mb-3 text-sm">Konfigurasi Soal</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="col-span-2">
                <label className="text-xs text-slate-500 dark:text-slate-400 block mb-2 font-medium">Pilih Topik (Bisa lebih dari 1)</label>
                <div className="flex flex-wrap gap-2">
                  {Object.values(Topic).map((t) => {
                    const isSelected = selectedTopics.includes(t);
                    return (
                      <button
                        key={t}
                        onClick={() => toggleTopic(t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-200 ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/30'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'
                        }`}
                      >
                        {t}
                        {isSelected && <span className="ml-1.5 inline-block">‚úì</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Kesulitan</label>
                <select 
                  className="w-full bg-white dark:bg-slate-800 p-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  value={config.difficulty}
                  onChange={(e) => setConfig({...config, difficulty: e.target.value as Difficulty})}
                >
                  {Object.values(Difficulty).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Jumlah Soal</label>
                <input 
                  type="number" 
                  min="1" 
                  max="20" 
                  className="w-full bg-white dark:bg-slate-800 p-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  value={config.count}
                  onChange={(e) => setConfig({...config, count: Math.max(1, Math.min(20, parseInt(e.target.value) || 1))})}
                />
              </div>

              <div className="col-span-2 flex flex-col sm:flex-row gap-4">
                 <div className="flex items-center gap-2 p-2 w-full bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <input 
                    type="checkbox" 
                    id="includeImagesGame"
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                    checked={includeImages}
                    onChange={(e) => setIncludeImages(e.target.checked)}
                  />
                  <label htmlFor="includeImagesGame" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                    Gambar AI
                  </label>
                </div>
                
                 <div className="flex items-center gap-2 p-2 w-full bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <input 
                    type="checkbox" 
                    id="includeExplanationGame"
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                    checked={includeExplanation}
                    onChange={(e) => setIncludeExplanation(e.target.checked)}
                  />
                  <label htmlFor="includeExplanationGame" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                    Pembahasan Detail
                  </label>
                </div>
              </div>
            </div>
            
            <button 
              onClick={handleGenerateAndStart}
              disabled={isGenerating || players.length < 2 || selectedTopics.length === 0}
              className="w-full py-4 bg-green-500 hover:bg-green-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-xl font-bold shadow-lg shadow-green-500/30 transition-all active:scale-95"
            >
              {isGenerating ? `Memproses... ${statusMsg.includes('Menggambar') ? '(Gambar AI)' : ''}` : players.length < 2 ? 'Tunggu Minimal 1 Siswa' : 'MULAI GAME SEKARANG'}
            </button>
            {isGenerating && includeImages && (
               <p className="text-center text-xs text-slate-400 mt-2 animate-pulse">
                 Generate gambar membutuhkan waktu lebih lama...
               </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 text-slate-400 dark:text-slate-500 animate-pulse">
             <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
             <p className="text-sm font-medium">Menunggu Guru memulai permainan...</p>
          </div>
        )}
      </div>
    </div>
  );

  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const handleAnswer = (idx: number) => {
    if (isAnswered) return;
    setSelectedOption(idx);
    setIsAnswered(true);
    
    // Robust Answer Checking Logic
    const currentQ = questions[currentQuestionIndex];
    const rawAnswer = currentQ.answer.trim().toUpperCase(); // e.g., "A", "A.", "A. 25"
    const optionChar = String.fromCharCode(65 + idx); // "A", "B", "C", "D"
    
    // Check 1: Does the answer start with the letter? (e.g. "A. 25" starts with "A")
    const startsWithChar = rawAnswer.startsWith(optionChar);
    
    // Check 2: Exact Match of the text?
    const optionText = currentQ.options?.[idx] || "";
    const textMatch = rawAnswer.includes(optionText) && optionText.length > 0;
    
    // Final Verdict
    const correct = startsWithChar || textMatch;
    
    setIsCorrect(correct);
    if (correct) {
      submitScore(myScore + 10);
    }
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsAnswered(false);
      setIsCorrect(false);
    } else {
      setGameState(GameState.LEADERBOARD);
    }
  };

  const renderPlaying = () => {
    const q = questions[currentQuestionIndex];
    if (!q) return <div>Loading...</div>;

    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6 text-white bg-slate-800 p-4 rounded-xl shadow-lg">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center font-bold border-2 border-white">
               {currentQuestionIndex + 1}
             </div>
             <span className="text-slate-300 text-sm">/ {questions.length}</span>
          </div>
          <div className="font-mono text-2xl font-bold text-yellow-400">
            SKOR: {myScore}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 shadow-xl border border-slate-200 dark:border-slate-700 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-slate-100">
            <div 
              className="h-full bg-blue-500 transition-all duration-300" 
              style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
            ></div>
          </div>

          <h3 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white leading-relaxed mb-8 mt-4">
            {q.text}
          </h3>

          {q.imageUrl && (
             <div className="mb-6 flex justify-center">
                <img src={q.imageUrl} alt="Ilustrasi" className="rounded-xl max-h-60 border border-slate-200 shadow-sm bg-white object-contain" />
             </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {q.options?.map((opt, idx) => {
              let btnClass = "p-4 rounded-xl text-left font-medium transition-all transform hover:scale-[1.01] border-2 ";
              if (isAnswered) {
                if (idx === selectedOption) {
                  btnClass += isCorrect 
                    ? "bg-green-500 border-green-600 text-white shadow-green-200" 
                    : "bg-red-500 border-red-600 text-white shadow-red-200";
                } else {
                   // If this option was the correct one but user didn't pick it, show it in green outline (optional, keeping simple for now)
                   // But let's verify if this index matches the answer for visual feedback
                   const rawAnswer = q.answer.trim().toUpperCase();
                   const optionChar = String.fromCharCode(65 + idx);
                   const isActuallyCorrect = rawAnswer.startsWith(optionChar);
                   
                   if (isActuallyCorrect && !isCorrect) {
                      btnClass += "bg-green-50 border-green-400 text-green-700 opacity-75 ";
                   } else {
                      btnClass += "bg-slate-50 border-slate-200 text-slate-400 opacity-50";
                   }
                }
              } else {
                btnClass += "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:shadow-md dark:text-slate-200";
              }

              return (
                <button 
                  key={idx}
                  onClick={() => handleAnswer(idx)}
                  disabled={isAnswered}
                  className={btnClass}
                >
                  <span className="inline-block w-8 font-bold opacity-50 mr-2">{String.fromCharCode(65 + idx)}.</span>
                  {opt}
                </button>
              );
            })}
          </div>

          {isAnswered && (
            <div className={`mt-8 p-4 rounded-xl text-center animate-bounce-in ${isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              <div className="font-bold text-lg mb-1">{isCorrect ? 'üéâ HEBAT! JAWABAN BENAR' : 'Ì†ΩÌ∏ì YAH, KURANG TEPAT'}</div>
              {!isCorrect && <div className="text-sm">Jawaban yang benar: {q.answer}</div>}
              
              <button 
                onClick={nextQuestion}
                className="mt-4 px-8 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition-colors"
              >
                {currentQuestionIndex < questions.length - 1 ? 'Soal Berikutnya ‚Üí' : 'Lihat Hasil Akhir'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderLeaderboard = () => (
    <div className="max-w-md mx-auto text-center">
      <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-8">HASIL AKHIR</h2>
      
      <div className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-xl border border-slate-200 dark:border-slate-700 mb-8">
        {players.sort((a,b) => b.score - a.score).map((p, idx) => (
          <div key={p.id} className={`p-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-700 ${p.id === (mode === 'HOST' ? 'HOST' : hostConnRef.current?.peer) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
             <div className="flex items-center gap-4">
               <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${idx === 0 ? 'bg-yellow-400' : idx === 1 ? 'bg-slate-400' : idx === 2 ? 'bg-orange-400' : 'bg-slate-200 text-slate-500'}`}>
                 {idx + 1}
               </div>
               <span className="font-bold text-slate-800 dark:text-slate-200">{p.name}</span>
             </div>
             <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-lg">{p.score}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {mode === 'HOST' ? (
          <button 
            onClick={handlePlayAgain}
            className="w-full py-3.5 px-6 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold shadow-lg shadow-green-500/30 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Main Lagi (Reset Room)
          </button>
        ) : (
          <div className="text-slate-500 dark:text-slate-400 text-sm font-medium animate-pulse mb-2">
            Menunggu Guru memulai permainan baru...
          </div>
        )}
        
        <button 
          onClick={() => window.location.reload()} 
          className="w-full py-3.5 px-6 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-white rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
        >
          {mode === 'HOST' ? 'Tutup Room' : 'Keluar'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-100px)] py-8 relative">
      <button onClick={onExit} className="absolute top-0 left-0 text-slate-400 hover:text-slate-600 flex items-center gap-1 text-sm font-bold z-10">
        ‚Üê Kembali
      </button>

      {errorMsg && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-full shadow-xl z-50 font-bold text-sm animate-bounce">
          {errorMsg}
          <button onClick={() => setErrorMsg('')} className="ml-4 opacity-75 hover:opacity-100">‚úï</button>
        </div>
      )}

      {gameState === GameState.SETUP && renderMainMenu()}
      {gameState === GameState.LOBBY && renderLobby()}
      {gameState === GameState.PLAYING && renderPlaying()}
      {gameState === GameState.LEADERBOARD && renderLeaderboard()}
    </div>
  );
};
