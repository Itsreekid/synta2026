'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Tier, Track, RegistrationData } from '@/lib/types';
import dynamic from 'next/dynamic';

// Dynamically import confetti to avoid SSR issues
const ReactConfetti = dynamic(() => import('react-confetti'), { ssr: false });

interface Props {
  registration: RegistrationData;
  track: Track;
  score: number;
  tier: Tier;
}

const tierConfig = {
  elite: {
    emoji: '👑',
    label: 'ÉLITE',
    subLabel: 'Génie en herbe',
    desc: 'Exceptionnel ! Tu fais partie du top 20%. Tu vas briller lors de la session.',
    badgeClass: 'badge-elite',
    color: '#ffd700',
    glow: 'rgba(255, 215, 0, 0.4)',
  },
  challenger: {
    emoji: '⚡',
    label: 'CHALLENGER',
    subLabel: 'Potentiel fort',
    desc: 'Bien joué ! Tu maîtrises les bases. La session va t\'aider à franchir le cap suivant.',
    badgeClass: 'badge-challenger',
    color: '#219EBC',
    glow: 'rgba(33, 158, 188, 0.4)',
  },
  explorer: {
    emoji: '🌱',
    label: 'EXPLORER',
    subLabel: 'Curieux & motivé',
    desc: 'C\'est le début de l\'aventure ! La session est faite pour toi — on repart des bases.',
    badgeClass: 'badge-explorer',
    color: '#94a3b8',
    glow: 'rgba(148, 163, 184, 0.3)',
  },
};

const trackLabels: Record<Track, string> = {
  '2eme': '2ème Année',
  '3eme': '3ème Année',
  bac: 'Bac Informatique',
};

function Countdown({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  const units = [
    { label: 'Jours', value: timeLeft.days },
    { label: 'Heures', value: timeLeft.hours },
    { label: 'Min', value: timeLeft.minutes },
    { label: 'Sec', value: timeLeft.seconds },
  ];

  return (
    <div className="flex items-center justify-center gap-3 mt-4">
      {units.map((u, i) => (
        <div key={u.label} className="flex items-center gap-3">
          <div className="text-center">
            <motion.div
              className="rounded-xl p-3 min-w-[56px] text-center"
              style={{ background: 'rgba(1,48,71,0.8)', border: '1px solid rgba(33,158,188,0.25)' }}
              key={u.value}
              animate={{ scale: [1.05, 1] }}
              transition={{ duration: 0.2 }}
            >
              <div className="text-2xl font-black tabular-nums" style={{ color: '#219EBC' }}>
                {String(u.value).padStart(2, '0')}
              </div>
            </motion.div>
            <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {u.label}
            </div>
          </div>
          {i < units.length - 1 && (
            <motion.span
              className="text-2xl font-black pb-4"
              style={{ color: '#F6851F' }}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              :
            </motion.span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function StepSuccess({ registration, track, score, tier }: Props) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [badgeVisible, setBadgeVisible] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const config = tierConfig[tier];
  const sessionDate = process.env.NEXT_PUBLIC_SESSION_DATE || '2026-08-15T20:00:00+01:00';

  useEffect(() => {
    setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    const timer1 = setTimeout(() => setShowConfetti(true), 300);
    const timer2 = setTimeout(() => setBadgeVisible(true), 600);
    const timer3 = setTimeout(() => setShowConfetti(false), 5000);
    return () => { clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3); };
  }, []);

  const firstName = registration.full_name?.split(' ')[0] || 'Étudiant';

  return (
    <>
      {showConfetti && (
        <ReactConfetti
          width={windowSize.width}
          height={windowSize.height}
          numberOfPieces={200}
          recycle={false}
          colors={['#F6851F', '#219EBC', '#013047', '#ffd700', '#ffffff']}
          gravity={0.25}
        />
      )}

      <div className="glass-card-orange p-8 text-center">
        {/* Personalized greeting */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <p className="text-sm font-medium mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
            🎉 Félicitations,
          </p>
          <h1 className="text-3xl font-black" style={{ color: '#F6851F' }}>
            {firstName} !
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {trackLabels[track]} · Score: {score} point{score > 1 ? 's' : ''}
          </p>
        </motion.div>

        {/* VIP Badge */}
        <AnimatePresence>
          {badgeVisible && (
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
              className="flex flex-col items-center mb-8"
            >
              <motion.div
                className={`w-28 h-28 rounded-full flex flex-col items-center justify-center ${config.badgeClass} mb-3`}
                animate={{ boxShadow: [`0 0 20px ${config.glow}`, `0 0 50px ${config.glow}`, `0 0 20px ${config.glow}`] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <span className="text-4xl">{config.emoji}</span>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <div
                  className="text-xl font-black tracking-widest"
                  style={{ color: config.color, textShadow: `0 0 20px ${config.glow}` }}
                >
                  {config.label}
                </div>
                <div className="text-xs font-medium mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {config.subLabel}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-sm leading-relaxed mb-8"
          style={{ color: 'rgba(255,255,255,0.65)' }}
        >
          {config.desc}
        </motion.p>

        {/* Countdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="rounded-2xl p-5"
          style={{ background: 'rgba(1,48,71,0.7)', border: '1px solid rgba(33,158,188,0.2)' }}
        >
          <p className="text-sm font-bold mb-1" style={{ color: '#219EBC' }}>
            📅 La session commence dans
          </p>
          <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
            15 Août 2026 à 20h00 — En ligne, sur Zoom
          </p>
          <Countdown targetDate={sessionDate} />
        </motion.div>

        {/* Share / Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3 }}
          className="mt-6 p-4 rounded-xl"
          style={{ background: 'rgba(246,133,31,0.08)', border: '1px solid rgba(246,133,31,0.2)' }}
        >
          <p className="text-xs font-semibold" style={{ color: '#F6851F' }}>
            📌 Check ton email pour le lien Zoom
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            On t&apos;a envoyé un email à <span style={{ color: '#219EBC' }}>{registration.email}</span>
          </p>
        </motion.div>
      </div>
    </>
  );
}
