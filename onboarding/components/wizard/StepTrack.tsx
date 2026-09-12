'use client';

import { motion } from 'framer-motion';
import type { Track, WizardState } from '@/lib/types';

interface Props {
  onSelect: (track: Track) => void;
  registration: WizardState['registration'];
}

const tracks: Array<{
  id: Track;
  label: string;
  emoji: string;
  description: string;
  color: string;
  glow: string;
  subjects: string[];
}> = [
  {
    id: '2eme',
    label: '2ème Année',
    emoji: '🌱',
    description: 'Bases solides & découverte de l\'informatique',
    color: 'from-emerald-600 to-teal-700',
    glow: 'rgba(16, 185, 129, 0.3)',
    subjects: ['Algorithmique', 'Python', 'Logique'],
  },
  {
    id: '3eme',
    label: '3ème Année',
    emoji: '⚡',
    description: 'Approfondissement & projets pratiques',
    color: 'from-blue-600 to-cyan-700',
    glow: 'rgba(33, 158, 188, 0.35)',
    subjects: ['Structures de données', 'Bases de données', 'Web'],
  },
  {
    id: 'bac',
    label: 'Bac Info',
    emoji: '🏆',
    description: 'Niveau avancé — prép exam national',
    color: 'from-orange-500 to-amber-600',
    glow: 'rgba(246, 133, 31, 0.35)',
    subjects: ['Algorithmes avancés', 'Complexité', 'Projets'],
  },
];

const cardVariants = {
  initial: { opacity: 0, y: 30 },
  animate: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, type: 'spring' as const, stiffness: 300, damping: 25 },
  }),
};

export default function StepTrack({ onSelect, registration }: Props) {
  return (
    <div className="glass-card p-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h2 className="text-2xl font-black mb-2" style={{ color: '#F6851F' }}>
          Ton niveau scolaire
        </h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Salut <span className="font-bold" style={{ color: '#219EBC' }}>
            {registration?.full_name?.split(' ')[0]}
          </span> ! Choisis ton niveau pour un quiz adapté 👇
        </p>
      </motion.div>

      <div className="space-y-3">
        {tracks.map((track, i) => (
          <motion.button
            key={track.id}
            custom={i}
            variants={cardVariants}
            initial="initial"
            animate="animate"
            onClick={() => onSelect(track.id)}
            whileHover={{
              scale: 1.025,
              boxShadow: `0 8px 40px ${track.glow}`,
              transition: { type: 'spring', stiffness: 400, damping: 20 },
            }}
            whileTap={{ scale: 0.98 }}
            className="w-full text-left rounded-2xl p-4 relative overflow-hidden group"
            style={{
              background: 'rgba(1, 48, 71, 0.6)',
              border: '1px solid rgba(33,158,188,0.2)',
              transition: 'border-color 0.2s',
            }}
          >
            {/* Gradient overlay on hover */}
            <motion.div
              className={`absolute inset-0 bg-gradient-to-r ${track.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300 rounded-2xl`}
            />

            <div className="flex items-center gap-4 relative z-10">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${track.glow.replace('0.3', '0.2')}, ${track.glow.replace('0.3', '0.05')})`, border: `1px solid ${track.glow}` }}
              >
                {track.emoji}
              </div>
              <div className="flex-1">
                <div className="font-black text-lg text-white mb-0.5">{track.label}</div>
                <div className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {track.description}
                </div>
                <div className="flex flex-wrap gap-1">
                  {track.subjects.map(s => (
                    <span
                      key={s}
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <motion.div
                className="text-2xl flex-shrink-0 opacity-0 group-hover:opacity-100"
                style={{ color: '#F6851F' }}
                initial={false}
                animate={{ x: 0 }}
                whileHover={{ x: 4 }}
              >
                →
              </motion.div>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
