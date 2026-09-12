'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Question, Track, Tier, RegistrationData } from '@/lib/types';
import MultipleChoice from '@/components/questions/MultipleChoice';
import DragAndDrop from '@/components/questions/DragAndDrop';

interface Props {
  registration: RegistrationData;
  track: Track;
  onComplete: (score: number, tier: Tier) => void;
}

export default function StepAssessment({ registration, track, onComplete }: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    fetch('/api/questions')
      .then(r => r.json())
      .then(d => {
        setQuestions(d.questions || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Impossible de charger les questions. Réessaie.');
        setLoading(false);
      });
  }, []);

  const currentQuestion = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;
  const hasAnswered = currentQuestion ? !!answers[currentQuestion.id] : false;
  const progress = questions.length > 0 ? ((currentIndex) / questions.length) * 100 : 0;

  const handleAnswer = useCallback((questionId: string, answer: string | string[]) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  }, []);

  const handleNext = () => {
    if (!isLast) {
      setDirection(1);
      setCurrentIndex(i => i + 1);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration_id: registration.id, answers }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Erreur de soumission');
      onComplete(data.score, data.tier as Tier);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
      setSubmitting(false);
    }
  };

  const slideVariants = {
    enter: (d: number) => ({ opacity: 0, x: d > 0 ? 80 : -80 }),
    center: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 30 } },
    exit: (d: number) => ({ opacity: 0, x: d > 0 ? -80 : 80, transition: { duration: 0.2 } }),
  };

  if (loading) {
    return (
      <div className="glass-card p-12 flex flex-col items-center gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 rounded-full border-2 border-transparent"
          style={{ borderTopColor: '#F6851F', borderRightColor: '#219EBC' }}
        />
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement des questions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="text-3xl mb-3">⚠️</div>
        <p style={{ color: '#f87171' }}>{error}</p>
        <button
          className="btn-primary mt-4"
          style={{ width: 'auto', padding: '0.75rem 2rem' }}
          onClick={() => window.location.reload()}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="text-3xl mb-3">🔧</div>
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>Aucune question disponible pour le moment.</p>
        <button className="btn-primary mt-4" onClick={() => onComplete(0, 'explorer')}>
          Continuer quand même →
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-black" style={{ color: '#219EBC' }}>
            🧠 Mini Quiz Tech
          </h2>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Question {currentIndex + 1} sur {questions.length}
          </p>
        </div>
        <div
          className="px-3 py-1 rounded-full text-xs font-bold"
          style={{ background: 'rgba(246,133,31,0.15)', color: '#F6851F', border: '1px solid rgba(246,133,31,0.3)' }}
        >
          {track === '2eme' ? '2ème' : track === '3eme' ? '3ème' : 'Bac'}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 rounded-full mb-6" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #219EBC, #F6851F)' }}
          animate={{ width: `${progress}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 30 }}
        />
      </div>

      {/* Question card */}
      <AnimatePresence custom={direction} mode="wait">
        <motion.div
          key={currentQuestion?.id}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
        >
          <div className="mb-6">
            <p className="text-base font-semibold leading-relaxed" style={{ color: 'rgba(255,255,255,0.9)' }}>
              {currentQuestion?.text}
            </p>
          </div>

          {currentQuestion?.type === 'multiple_choice' && (
            <MultipleChoice
              question={currentQuestion}
              selected={answers[currentQuestion.id] as string}
              onSelect={(answer) => handleAnswer(currentQuestion.id, answer)}
            />
          )}

          {currentQuestion?.type === 'drag_drop' && (
            <DragAndDrop
              question={currentQuestion}
              currentOrder={answers[currentQuestion.id] as string[] | undefined}
              onReorder={(order) => handleAnswer(currentQuestion.id, order)}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="mt-6 flex gap-3">
        {currentIndex > 0 && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => { setDirection(-1); setCurrentIndex(i => i - 1); }}
            className="flex-1 py-3 rounded-xl font-semibold text-sm"
            style={{
              background: 'rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            ← Précédent
          </motion.button>
        )}
        {!isLast ? (
          <motion.button
            whileHover={{ scale: hasAnswered ? 1.03 : 1 }}
            whileTap={{ scale: hasAnswered ? 0.97 : 1 }}
            onClick={handleNext}
            disabled={!hasAnswered}
            className="flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200"
            style={{
              background: hasAnswered ? 'linear-gradient(135deg, #219EBC, #0d7fa0)' : 'rgba(255,255,255,0.08)',
              color: hasAnswered ? 'white' : 'rgba(255,255,255,0.3)',
              border: 'none',
              cursor: hasAnswered ? 'pointer' : 'not-allowed',
            }}
          >
            Suivant →
          </motion.button>
        ) : (
          <motion.button
            whileHover={{ scale: hasAnswered && !submitting ? 1.03 : 1 }}
            whileTap={{ scale: hasAnswered && !submitting ? 0.97 : 1 }}
            onClick={handleSubmit}
            disabled={!hasAnswered || submitting}
            className="flex-1 py-3 rounded-xl font-bold text-sm"
            style={{
              background: hasAnswered && !submitting
                ? 'linear-gradient(135deg, #F6851F, #e07415)'
                : 'rgba(255,255,255,0.08)',
              color: hasAnswered && !submitting ? 'white' : 'rgba(255,255,255,0.3)',
              border: 'none',
              cursor: hasAnswered && !submitting ? 'pointer' : 'not-allowed',
              boxShadow: hasAnswered && !submitting ? '0 4px 20px rgba(246,133,31,0.35)' : 'none',
            }}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  className="inline-block w-4 h-4 rounded-full border-2 border-white border-t-transparent"
                />
                Calcul...
              </span>
            ) : (
              '🚀 Terminer le quiz'
            )}
          </motion.button>
        )}
      </div>
    </div>
  );
}
