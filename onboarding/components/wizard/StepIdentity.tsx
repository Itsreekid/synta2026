'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { WizardState } from '@/lib/types';

interface Props {
  onComplete: (registration: WizardState['registration']) => void;
}

const inputFields = [
  { key: 'full_name', label: 'Nom complet', placeholder: 'Ex: Ahmed Ben Ali', type: 'text', icon: '👤' },
  { key: 'email', label: 'Adresse email', placeholder: 'ton@email.com', type: 'email', icon: '✉️' },
  { key: 'phone', label: 'Numéro de téléphone', placeholder: '+216 XX XXX XXX', type: 'tel', icon: '📱' },
] as const;

export default function StepIdentity({ onComplete }: Props) {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.full_name.trim() || !form.email.trim() || !form.phone.trim()) {
      setError('Merci de remplir tous les champs.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Une erreur est survenue.');
      }

      onComplete(data.registration);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-center mb-8"
      >
        <div className="text-4xl mb-3">🎓</div>
        <h1 className="text-2xl font-black mb-2" style={{ color: '#219EBC' }}>
          Session Gratuite Exclusive
        </h1>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Inscris-toi et découvre ton niveau — 100% gratuit, aucune carte requise
        </p>
      </motion.div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {inputFields.map((field, i) => (
          <motion.div
            key={field.key}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.08 }}
          >
            <label
              htmlFor={field.key}
              className="block text-sm font-semibold mb-1.5"
              style={{ color: 'rgba(33,158,188,0.9)' }}
            >
              {field.icon} {field.label}
            </label>
            <motion.input
              id={field.key}
              type={field.type}
              placeholder={field.placeholder}
              value={form[field.key]}
              onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
              onFocus={() => setFocused(field.key)}
              onBlur={() => setFocused(null)}
              className="synta-input"
              animate={{
                borderColor: focused === field.key ? '#219EBC' : 'rgba(33,158,188,0.25)',
                boxShadow: focused === field.key ? '0 0 0 3px rgba(33,158,188,0.15)' : '0 0 0 0px transparent',
              }}
              transition={{ duration: 0.2 }}
              required
              autoComplete="off"
            />
          </motion.div>
        ))}

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-center py-2 px-4 rounded-lg"
            style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            ⚠️ {error}
          </motion.p>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="pt-2"
        >
          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  className="inline-block w-4 h-4 rounded-full border-2 border-white border-t-transparent"
                />
                Traitement en cours...
              </span>
            ) : (
              'Réserver ma place gratuite →'
            )}
          </button>
        </motion.div>

        <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          🔒 Tes données sont sécurisées. Aucun spam.
        </p>
      </form>
    </div>
  );
}
