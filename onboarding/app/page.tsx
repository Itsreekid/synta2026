'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getSession, saveSession, updateSession } from '@/lib/session';
import type { WizardState, Track, Tier } from '@/lib/types';
import StepIdentity from '@/components/wizard/StepIdentity';
import StepTrack from '@/components/wizard/StepTrack';
import StepAssessment from '@/components/wizard/StepAssessment';
import StepSuccess from '@/components/wizard/StepSuccess';

const pageVariants = {
  initial: { opacity: 0, x: 60 },
  animate: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 30 } },
  exit: { opacity: 0, x: -60, transition: { duration: 0.2 } },
};

function BackgroundOrbs() {
  return (
    <>
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden -z-10">
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 600,
            height: 600,
            top: '-200px',
            left: '-200px',
            background: 'radial-gradient(circle, rgba(33,158,188,0.12) 0%, transparent 70%)',
          }}
          animate={{ scale: [1, 1.15, 1], rotate: [0, 45, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 500,
            height: 500,
            bottom: '-150px',
            right: '-150px',
            background: 'radial-gradient(circle, rgba(246,133,31,0.1) 0%, transparent 70%)',
          }}
          animate={{ scale: [1, 1.2, 1], rotate: [0, -30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 300,
            height: 300,
            top: '40%',
            left: '60%',
            background: 'radial-gradient(circle, rgba(1,48,71,0.8) 0%, transparent 70%)',
          }}
          animate={{ y: [-20, 20, -20] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />
      </div>
    </>
  );
}

function StepIndicator({ step }: { step: number }) {
  const steps = [
    { num: 1, label: 'Identité' },
    { num: 2, label: 'Niveau' },
    { num: 3, label: 'Quiz' },
    { num: 4, label: 'VIP' },
  ];

  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <motion.div
            animate={{
              backgroundColor: step >= s.num ? '#F6851F' : step === s.num - 1 ? '#219EBC' : 'rgba(255,255,255,0.1)',
              scale: step === s.num ? 1.15 : 1,
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white relative"
            style={{ border: step === s.num ? '2px solid rgba(246,133,31,0.8)' : '2px solid transparent' }}
          >
            {step > s.num ? '✓' : s.num}
            {step === s.num && (
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ border: '2px solid rgba(246,133,31,0.4)' }}
                animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </motion.div>
          {i < steps.length - 1 && (
            <motion.div
              className="h-0.5 mx-1"
              style={{ width: 32 }}
              animate={{ backgroundColor: step > s.num ? '#F6851F' : 'rgba(255,255,255,0.1)' }}
              transition={{ duration: 0.4 }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const [state, setState] = useState<WizardState>({
    step: 1,
    registration: null,
    track: null,
    answers: {},
    score: 0,
    tier: 'explorer',
  });
  const [isLoading, setIsLoading] = useState(true);

  // Check for returning user on mount
  useEffect(() => {
    const session = getSession();
    if (session && session.id) {
      if (session.completed) {
        // Full returning user — go straight to success screen
        setState({
          step: 4,
          registration: {
            id: session.id,
            full_name: session.full_name,
            email: session.email,
            track: (session.track as Track) || null,
            tier: (session.tier as Tier) || 'explorer',
            score: session.score || 0,
            completed: true,
          },
          track: (session.track as Track) || null,
          answers: {},
          score: session.score || 0,
          tier: (session.tier as Tier) || 'explorer',
        });
      } else if (session.track) {
        // Has track but didn't finish quiz
        setState({
          step: 3,
          registration: {
            id: session.id,
            full_name: session.full_name,
            email: session.email,
            track: (session.track as Track) || null,
          },
          track: (session.track as Track) || null,
          answers: {},
          score: 0,
          tier: 'explorer',
        });
      } else {
        // Registered but didn't pick track
        setState(prev => ({
          ...prev,
          step: 2,
          registration: {
            id: session.id,
            full_name: session.full_name,
            email: session.email,
          },
        }));
      }
    }
    setIsLoading(false);
  }, []);

  const handleRegistered = useCallback((registration: WizardState['registration']) => {
    if (!registration) return;
    saveSession({
      id: registration.id,
      full_name: registration.full_name,
      email: registration.email,
    });
    if (registration.completed) {
      // Returning completed user
      setState({
        step: 4,
        registration,
        track: (registration.track as Track) || null,
        answers: {},
        score: registration.score || 0,
        tier: (registration.tier as Tier) || 'explorer',
      });
    } else {
      setState(prev => ({ ...prev, step: 2, registration }));
    }
  }, []);

  const handleTrackSelected = useCallback((track: Track) => {
    updateSession({ track });
    setState(prev => ({ ...prev, step: 3, track }));
  }, []);

  const handleAssessmentComplete = useCallback(
    (score: number, tier: Tier) => {
      updateSession({ score, tier, completed: true });
      setState(prev => ({ ...prev, step: 4, score, tier }));
    },
    []
  );

  if (isLoading) {
    return (
      <div className="bg-synta min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 rounded-full border-2 border-transparent"
          style={{ borderTopColor: '#F6851F', borderRightColor: '#219EBC' }}
        />
      </div>
    );
  }

  return (
    <main className="bg-synta min-h-screen flex flex-col items-center justify-center px-4 py-8 relative">
      <BackgroundOrbs />

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-6 flex flex-col items-center"
      >
        <div className="flex items-center gap-2">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xl"
            style={{ background: 'linear-gradient(135deg, #013047, #219EBC)' }}
          >
            <span style={{ color: '#F6851F' }}>S</span>
          </div>
          <span className="text-2xl font-black tracking-tight" style={{ color: '#219EBC' }}>
            Synta<span style={{ color: '#F6851F' }}>Academy</span>
          </span>
        </div>
        <p className="text-xs mt-1" style={{ color: 'rgba(33,158,188,0.7)' }}>
          Session Gratuite Exclusive 🎓
        </p>
      </motion.div>

      {/* Step indicator — only show for steps 1-3 */}
      {state.step < 4 && <StepIndicator step={state.step} />}

      {/* Wizard container */}
      <div className="w-full max-w-md relative">
        <AnimatePresence mode="wait">
          {state.step === 1 && (
            <motion.div key="step1" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <StepIdentity onComplete={handleRegistered} />
            </motion.div>
          )}
          {state.step === 2 && (
            <motion.div key="step2" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <StepTrack onSelect={handleTrackSelected} registration={state.registration} />
            </motion.div>
          )}
          {state.step === 3 && (
            <motion.div key="step3" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <StepAssessment
                registration={state.registration!}
                track={state.track!}
                onComplete={handleAssessmentComplete}
              />
            </motion.div>
          )}
          {state.step === 4 && (
            <motion.div key="step4" variants={pageVariants} initial="initial" animate="animate" exit="exit">
              <StepSuccess
                registration={state.registration!}
                track={state.track || (state.registration?.track as Track) || '2eme'}
                score={state.score}
                tier={state.tier}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
