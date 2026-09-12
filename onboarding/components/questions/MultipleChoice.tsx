'use client';

import { motion } from 'framer-motion';
import type { Question } from '@/lib/types';

interface Props {
  question: Question;
  selected?: string;
  onSelect: (answer: string) => void;
}

export default function MultipleChoice({ question, selected, onSelect }: Props) {
  return (
    <div className="space-y-2.5">
      {question.options.map((option, i) => {
        const isSelected = selected === option.id;
        return (
          <motion.button
            key={option.id}
            onClick={() => onSelect(option.id)}
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07, type: 'spring', stiffness: 400, damping: 30 }}
            whileHover={{ scale: 1.02, transition: { type: 'spring', stiffness: 500, damping: 30 } }}
            whileTap={{ scale: 0.98 }}
            className="w-full text-left p-3.5 rounded-xl flex items-center gap-3 transition-all duration-150"
            style={{
              background: isSelected
                ? 'rgba(33, 158, 188, 0.18)'
                : 'rgba(255,255,255,0.04)',
              border: isSelected
                ? '1.5px solid rgba(33, 158, 188, 0.7)'
                : '1.5px solid rgba(255,255,255,0.08)',
              boxShadow: isSelected ? '0 0 16px rgba(33,158,188,0.15)' : 'none',
            }}
          >
            {/* Radio circle */}
            <motion.div
              animate={{
                background: isSelected ? '#219EBC' : 'transparent',
                borderColor: isSelected ? '#219EBC' : 'rgba(255,255,255,0.25)',
              }}
              className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
            >
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 20 }}
                  className="w-2 h-2 rounded-full bg-white"
                />
              )}
            </motion.div>

            {/* Option label */}
            <span
              className="text-sm font-medium"
              style={{ color: isSelected ? 'white' : 'rgba(255,255,255,0.7)' }}
            >
              <span
                className="font-bold mr-2"
                style={{ color: isSelected ? '#219EBC' : 'rgba(255,255,255,0.3)' }}
              >
                {option.id.toUpperCase()}.
              </span>
              {option.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
