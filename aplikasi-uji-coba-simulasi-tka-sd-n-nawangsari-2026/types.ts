
export enum QuestionType {
  MULTIPLE_CHOICE = 'Pilihan Ganda',
  SHORT_ANSWER = 'Isian Singkat',
  ESSAY = 'Uraian'
}

export enum Topic {
  BILANGAN = 'Bilangan',
  GEOMETRI = 'Geometri dan Pengukuran',
  DATA = 'Pengolahan Data'
}

export enum Difficulty {
  EASY = 'Mudah (Pemahaman Konsep)',
  MEDIUM = 'Sedang (Penerapan)',
  HARD = 'Sulit (Analisis)',
  HOTS = 'HOTS (Penalaran Tinggi)'
}

export interface Question {
  id: string;
  type: QuestionType;
  topic: Topic;
  text: string;
  options?: string[]; // Only for Multiple Choice
  answer: string;
  explanation: string;
  imagePrompt?: string; // Prompt for AI to generate an image
  imageUrl?: string;    // Generated image URL
}

export interface GenerationConfig {
  topic: Topic;
  count: number;
  type: QuestionType;
  difficulty: Difficulty;
  includeImages: boolean;
  includeExplanation: boolean;
}

// --- GAME TYPES ---

export interface Player {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
}

export enum GameState {
  SETUP = 'SETUP',           // Host configuring
  LOBBY = 'LOBBY',           // Waiting for players
  PLAYING = 'PLAYING',       // Game in progress
  LEADERBOARD = 'LEADERBOARD' // Final results
}

export interface GamePacket {
  type: 'JOIN' | 'START_GAME' | 'SUBMIT_SCORE' | 'KICK' | 'UPDATE_PLAYERS' | 'RESET_LOBBY';
  payload: any;
}
