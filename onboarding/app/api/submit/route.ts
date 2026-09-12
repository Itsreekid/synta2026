import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

function computeTier(score: number, total: number): 'explorer' | 'challenger' | 'elite' {
  if (total === 0) return 'explorer';
  const pct = score / total;
  if (pct >= 0.8) return 'elite';
  if (pct >= 0.5) return 'challenger';
  return 'explorer';
}

export async function POST(req: NextRequest) {
  try {
    const { registration_id, answers } = await req.json();
    // answers: Record<questionId, string | string[]>

    if (!registration_id || !answers) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Fetch questions with correct answers (server-side only)
    const { data: questions, error: qError } = await supabaseAdmin
      .from('session_questions')
      .select('id, correct_answer, type')
      .eq('is_active', true);

    if (qError || !questions) {
      return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 });
    }

    // Grade answers
    let score = 0;
    const submissions = [];

    for (const question of questions) {
      const userAnswer = answers[question.id];
      if (userAnswer === undefined) continue;

      let is_correct = false;
      const correct = question.correct_answer;

      if (question.type === 'drag_drop') {
        // Compare arrays
        const userArr = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
        const correctArr = Array.isArray(correct) ? correct : [correct];
        is_correct = JSON.stringify(userArr) === JSON.stringify(correctArr);
      } else {
        is_correct = String(userAnswer).trim() === String(correct).trim();
      }

      if (is_correct) score++;

      submissions.push({
        registration_id,
        question_id: question.id,
        answer: userAnswer,
        is_correct,
      });
    }

    const tier = computeTier(score, questions.length);

    // Insert all submissions
    if (submissions.length > 0) {
      await supabaseAdmin.from('session_submissions').upsert(submissions, {
        onConflict: 'registration_id,question_id',
      });
    }

    // Update registration with score, tier, and mark completed
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('session_registrations')
      .update({ score, tier, completed: true, updated_at: new Date().toISOString() })
      .eq('id', registration_id)
      .select('id, full_name, email, track, score, tier, completed')
      .single();

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update registration' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      score,
      total: questions.length,
      tier,
      registration: updated,
    });
  } catch (error) {
    console.error('Submit API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
