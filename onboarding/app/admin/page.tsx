'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Question, QuestionType } from '@/lib/types';

const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '';

const emptyForm = {
  text: '',
  type: 'multiple_choice' as QuestionType,
  options: [
    { id: 'a', label: '' },
    { id: 'b', label: '' },
    { id: 'c', label: '' },
    { id: 'd', label: '' },
  ],
  correct_answer: '',
  explanation: '',
  order_index: 0,
  is_active: true,
};

type FormData = typeof emptyForm;

function QuestionTypeTag({ type }: { type: QuestionType }) {
  const colors: Record<QuestionType, string> = {
    multiple_choice: 'rgba(33,158,188,0.2)',
    drag_drop: 'rgba(246,133,31,0.2)',
    short_input: 'rgba(148,163,184,0.2)',
  };
  const textColors: Record<QuestionType, string> = {
    multiple_choice: '#219EBC',
    drag_drop: '#F6851F',
    short_input: '#94a3b8',
  };
  const labels: Record<QuestionType, string> = {
    multiple_choice: '☑ Multiple Choice',
    drag_drop: '↕ Drag & Drop',
    short_input: '✏ Short Input',
  };

  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-semibold"
      style={{ background: colors[type], color: textColors[type] }}
    >
      {labels[type]}
    </span>
  );
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/questions');
    const data = await res.json();
    setQuestions(data.questions || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) fetchQuestions();
  }, [authed, fetchQuestions]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const expected = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'synta-admin-2026';
    if (password === expected) setAuthed(true);
    else alert('Mot de passe incorrect');
  };

  const openCreate = () => {
    setForm(emptyForm);
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (q: Question) => {
    setEditing(q);
    setCreating(true);
    setForm({
      text: q.text,
      type: q.type,
      options: Array.isArray(q.options) && q.options.length > 0
        ? q.options
        : emptyForm.options,
      correct_answer: Array.isArray(q.correct_answer)
        ? JSON.stringify(q.correct_answer)
        : String(q.correct_answer),
      explanation: q.explanation || '',
      order_index: q.order_index,
      is_active: true,
    });
  };

  const handleSave = async () => {
    if (!form.text.trim()) { alert('Texte de la question requis.'); return; }
    setSaving(true);

    let correct: string | string[] = form.correct_answer;
    if (form.type === 'drag_drop') {
      try { correct = JSON.parse(form.correct_answer); } catch { /* keep as string */ }
    }

    const payload = {
      ...form,
      options: form.options.filter(o => o.label.trim()),
      correct_answer: correct,
      ...(editing ? { id: editing.id } : {}),
    };

    const method = editing ? 'PATCH' : 'POST';
    const res = await fetch('/api/admin/questions', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      showToast(editing ? '✅ Question mise à jour' : '✅ Question créée');
      setCreating(false);
      setEditing(null);
      fetchQuestions();
    } else {
      const d = await res.json();
      alert('Erreur: ' + d.error);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const res = await fetch('/api/admin/questions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      showToast('🗑 Question supprimée');
      setDeleteConfirm(null);
      fetchQuestions();
    }
  };

  const toggleActive = async (q: Question) => {
    await fetch('/api/admin/questions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: q.id, is_active: !q.is_active }),
    });
    fetchQuestions();
  };

  // Login screen
  if (!authed) {
    return (
      <main className="bg-synta min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-8 w-full max-w-sm"
        >
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🔐</div>
            <h1 className="text-2xl font-black" style={{ color: '#219EBC' }}>Admin Panel</h1>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Synta Academy — Questions Manager</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="Mot de passe admin"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="synta-input"
              autoFocus
            />
            <button type="submit" className="btn-primary">Connexion →</button>
          </form>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="bg-synta min-h-screen px-4 py-8">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 right-4 z-50 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(33,158,188,0.9)', color: 'white', backdropFilter: 'blur(10px)' }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black" style={{ color: '#219EBC' }}>⚙️ Admin — Questions</h1>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {questions.length} question{questions.length !== 1 ? 's' : ''} au total
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={openCreate}
            className="px-5 py-2.5 rounded-xl font-bold text-sm"
            style={{
              background: 'linear-gradient(135deg, #F6851F, #e07415)',
              color: 'white',
              border: 'none',
              boxShadow: '0 4px 16px rgba(246,133,31,0.3)',
            }}
          >
            + Nouvelle question
          </motion.button>
        </div>

        {/* Question List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 rounded-full border-2 border-transparent"
              style={{ borderTopColor: '#F6851F', borderRightColor: '#219EBC' }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {questions.map((q, i) => (
                <motion.div
                  key={q.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card p-4"
                  style={{ opacity: q.is_active ? 1 : 0.5 }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span
                          className="w-6 h-6 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0"
                          style={{ background: 'rgba(246,133,31,0.2)', color: '#F6851F' }}
                        >
                          {q.order_index}
                        </span>
                        <QuestionTypeTag type={q.type} />
                        {!q.is_active && (
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                            Inactif
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>
                        {q.text}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {q.options?.length || 0} options · Réponse: {' '}
                        <code style={{ color: '#219EBC' }}>
                          {Array.isArray(q.correct_answer)
                            ? JSON.stringify(q.correct_answer)
                            : String(q.correct_answer)}
                        </code>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleActive(q)}
                        className="text-xs px-2 py-1 rounded-lg"
                        style={{
                          background: q.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)',
                          color: q.is_active ? '#34d399' : 'rgba(255,255,255,0.4)',
                          border: `1px solid ${q.is_active ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}`,
                        }}
                      >
                        {q.is_active ? '● Actif' : '○ Inactif'}
                      </button>
                      <button
                        onClick={() => openEdit(q)}
                        className="text-xs px-2 py-1 rounded-lg"
                        style={{ background: 'rgba(33,158,188,0.1)', color: '#219EBC', border: '1px solid rgba(33,158,188,0.2)' }}
                      >
                        ✏ Éditer
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(q.id)}
                        className="text-xs px-2 py-1 rounded-lg"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {questions.length === 0 && (
              <div className="text-center py-16" style={{ color: 'rgba(255,255,255,0.3)' }}>
                <div className="text-4xl mb-3">📝</div>
                <p>Aucune question. Crée la première !</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setCreating(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="glass-card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-xl font-black mb-6" style={{ color: editing ? '#219EBC' : '#F6851F' }}>
                {editing ? '✏ Modifier la question' : '+ Nouvelle question'}
              </h2>

              <div className="space-y-4">
                {/* Question text */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(33,158,188,0.8)' }}>
                    Texte de la question *
                  </label>
                  <textarea
                    value={form.text}
                    onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                    className="synta-input"
                    rows={3}
                    placeholder="Ex: Quel est le résultat de print(2 ** 3) ?"
                    style={{ resize: 'vertical' }}
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(33,158,188,0.8)' }}>
                    Type de question *
                  </label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as QuestionType }))}
                    className="synta-input"
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="multiple_choice">☑ Multiple Choice</option>
                    <option value="drag_drop">↕ Drag & Drop (Ordonner)</option>
                    <option value="short_input">✏ Short Input</option>
                  </select>
                </div>

                {/* Options */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(33,158,188,0.8)' }}>
                    Options (ID + Libellé)
                  </label>
                  <div className="space-y-2">
                    {form.options.map((opt, i) => (
                      <div key={opt.id} className="flex gap-2 items-center">
                        <span
                          className="w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center flex-shrink-0"
                          style={{ background: 'rgba(33,158,188,0.15)', color: '#219EBC' }}
                        >
                          {opt.id.toUpperCase()}
                        </span>
                        <input
                          type="text"
                          value={opt.label}
                          onChange={e => {
                            const updated = [...form.options];
                            updated[i] = { ...updated[i], label: e.target.value };
                            setForm(f => ({ ...f, options: updated }));
                          }}
                          className="synta-input"
                          style={{ padding: '0.5rem 0.875rem', fontSize: '0.875rem' }}
                          placeholder={`Option ${opt.id.toUpperCase()}`}
                        />
                        {form.options.length > 2 && (
                          <button
                            onClick={() => setForm(f => ({ ...f, options: f.options.filter((_, idx) => idx !== i) }))}
                            className="text-xs px-2 py-1 rounded-lg flex-shrink-0"
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const nextId = String.fromCharCode(97 + form.options.length);
                        setForm(f => ({ ...f, options: [...f.options, { id: nextId, label: '' }] }));
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg"
                      style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(255,255,255,0.15)' }}
                    >
                      + Ajouter option
                    </button>
                  </div>
                </div>

                {/* Correct Answer */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(33,158,188,0.8)' }}>
                    Réponse correcte *{' '}
                    {form.type === 'drag_drop' && (
                      <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                        (JSON array des IDs dans l&apos;ordre: [&quot;id1&quot;,&quot;id2&quot;,...])
                      </span>
                    )}
                    {form.type === 'multiple_choice' && (
                      <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                        (ID de l&apos;option: a, b, c, ...)
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={form.correct_answer}
                    onChange={e => setForm(f => ({ ...f, correct_answer: e.target.value }))}
                    className="synta-input"
                    placeholder={form.type === 'drag_drop' ? '["2","1","3","4"]' : 'b'}
                  />
                </div>

                {/* Explanation */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(33,158,188,0.8)' }}>
                    Explication (optionnel)
                  </label>
                  <input
                    type="text"
                    value={form.explanation}
                    onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))}
                    className="synta-input"
                    placeholder="Explication de la réponse..."
                  />
                </div>

                {/* Order */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(33,158,188,0.8)' }}>
                    Ordre (numéro de position)
                  </label>
                  <input
                    type="number"
                    value={form.order_index}
                    onChange={e => setForm(f => ({ ...f, order_index: parseInt(e.target.value) || 0 }))}
                    className="synta-input"
                    min={0}
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setCreating(false); setEditing(null); }}
                    className="flex-1 py-3 rounded-xl font-semibold text-sm"
                    style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 py-3 rounded-xl font-bold text-sm"
                    style={{
                      background: 'linear-gradient(135deg, #F6851F, #e07415)',
                      color: 'white',
                      border: 'none',
                      opacity: saving ? 0.7 : 1,
                    }}
                  >
                    {saving ? 'Enregistrement...' : editing ? 'Mettre à jour' : 'Créer'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirm Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.8)' }}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="glass-card p-6 w-full max-w-sm text-center"
            >
              <div className="text-3xl mb-3">⚠️</div>
              <h3 className="text-lg font-black mb-2 text-white">Supprimer cette question ?</h3>
              <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Cette action est irréversible.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm"
                  style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                  style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white' }}
                >
                  Supprimer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
