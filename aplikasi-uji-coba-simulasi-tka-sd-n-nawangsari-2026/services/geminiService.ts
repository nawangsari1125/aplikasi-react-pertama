
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Question, QuestionType, Topic, GenerationConfig } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const QUESTION_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING, description: "Teks soal dalam Bahasa Indonesia" },
      options: { 
        type: Type.ARRAY, 
        items: { type: Type.STRING },
        description: "4 pilihan jawaban (A, B, C, D) jika tipe soal Pilihan Ganda" 
      },
      answer: { type: Type.STRING, description: "Kunci Jawaban. PENTING: Untuk Pilihan Ganda, HANYA tulis satu huruf (A, B, C, atau D). Untuk Isian, tulis jawaban singkat." },
      explanation: { type: Type.STRING, description: "Penjelasan detail langkah demi langkah cara pengerjaan soal" },
      imagePrompt: { type: Type.STRING, description: "Deskripsi visual untuk ilustrasi soal (misal: diagram, bangun ruang, ilustrasi cerita) dalam Bahasa Inggris agar akurat untuk generator gambar" }
    },
    required: ["text", "answer", "explanation"]
  }
};

export const generateQuestions = async (config: GenerationConfig): Promise<Question[]> => {
  const prompt = `
    Buatlah ${config.count} soal latihan Matematika Kelas 6 SD untuk Tes Kemampuan Akademik (TKA).
    Topik: ${config.topic}
    Tipe Soal: ${config.type}
    Tingkat Kesulitan: ${config.difficulty}
    
    Kriteria Soal:
    1. Mengacu pada Kurikulum 2013 dan Kurikulum Merdeka.
    2. Konteks: Keseharian, personal, keluarga, atau lingkungan sekitar.
    3. Kompetensi: Penalaran, pemecahan masalah, dan koneksi matematis.
    4. Sesuaikan kompleksitas angka dan logika dengan tingkat kesulitan yang diminta (${config.difficulty}).
    
    ATURAN FORMAT JAWABAN (Sangat Penting):
    - Jika tipe soal adalah Pilihan Ganda: Field 'answer' HARUS HANYA berisi SATU huruf (A, B, C, atau D). Jangan tulis teks jawabannya. Contoh: "A" (Bukan "A. 25 cm").
    - Berikan 4 opsi jawaban di array 'options'.
    
    ${config.includeExplanation 
      ? "INSTRUKSI PEMBAHASAN: Wajib sertakan pembahasan (explanation) yang SANGAT MENDETAIL, langkah demi langkah (step-by-step), dan edukatif agar siswa paham konsep dan asal jawabannya." 
      : "INSTRUKSI PEMBAHASAN: Sertakan pembahasan singkat."}

    Jika diperlukan ilustrasi (terutama untuk Geometri atau Data), berikan deskripsi gambar yang sangat detail di field imagePrompt.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: QUESTION_SCHEMA
    }
  });

  const rawQuestions = JSON.parse(response.text || "[]");
  
  return rawQuestions.map((q: any, index: number) => ({
    ...q,
    id: `q-${Date.now()}-${index}`,
    type: config.type,
    topic: config.topic,
  }));
};

export const generateQuestionImage = async (imagePrompt: string): Promise<string | undefined> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `A clean mathematical educational illustration for kids: ${imagePrompt}. Minimalistic, white background, precise lines.` }]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (error: any) {
    // Gracefully handle quota exceeded or rate limits
    if (error.status === 429 || error.toString().includes('429') || error.toString().includes('RESOURCE_EXHAUSTED')) {
      console.warn("Image generation quota exceeded. Skipping image.");
      return undefined;
    }
    console.error("Error generating image:", error);
  }
  return undefined;
};
