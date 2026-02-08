
import React from 'react';
import { Question, QuestionType } from '../types';

interface QuestionCardProps {
  question: Question;
  number: number;
  showAnswer: boolean;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({ question, number, showAnswer }) => {
  return (
    <div className="question-card bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden mb-6 hover:border-blue-300 dark:hover:border-blue-700 transition-colors duration-200">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
            {question.topic}
          </span>
          <span className="text-sm font-medium text-slate-400 dark:text-slate-500">Soal #{number}</span>
        </div>

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p className="text-slate-800 dark:text-slate-100 text-lg leading-relaxed whitespace-pre-wrap font-medium">
            {question.text}
          </p>
        </div>

        {question.imageUrl && (
          <div className="mt-6 flex justify-center">
            <img 
              src={question.imageUrl} 
              alt="Ilustrasi Soal" 
              className="rounded-lg shadow-md max-h-64 object-contain border border-slate-100 dark:border-slate-700 bg-white" 
            />
          </div>
        )}

        {question.type === QuestionType.MULTIPLE_CHOICE && question.options && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {question.options.map((option, idx) => (
              <div 
                key={idx}
                className="flex items-center p-3 border border-slate-100 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300"
              >
                <span className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-600 font-bold text-blue-600 dark:text-blue-400 mr-3 shrink-0">
                  {String.fromCharCode(65 + idx)}
                </span>
                <span>{option}</span>
              </div>
            ))}
          </div>
        )}

        {question.type === QuestionType.SHORT_ANSWER && (
          <div className="mt-6">
            <div className="h-10 border-b-2 border-slate-200 dark:border-slate-700 border-dashed w-full max-w-xs"></div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 italic">Tuliskan jawaban Anda di atas</p>
          </div>
        )}

        {question.type === QuestionType.ESSAY && (
          <div className="mt-6 space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-8 border-b border-slate-200 dark:border-slate-700 border-dashed w-full"></div>
            ))}
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 italic">Tuliskan langkah-langkah pengerjaan di atas</p>
          </div>
        )}

        {showAnswer && (
          <div className="mt-8 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-900/30 transition-colors duration-200">
            <h4 className="text-sm font-bold text-green-800 dark:text-green-400 mb-2 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Kunci Jawaban & Pembahasan
            </h4>
            <div className="text-green-900 dark:text-green-300 font-bold mb-2">Jawaban: {question.answer}</div>
            <p className="text-green-800 dark:text-green-400 text-sm leading-relaxed">{question.explanation}</p>
          </div>
        )}
      </div>
    </div>
  );
};
