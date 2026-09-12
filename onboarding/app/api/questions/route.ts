import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET() {
  try {
    const { data: questions, error } = await supabaseAdmin
      .from('session_questions')
      .select('id, text, type, options, order_index, explanation')
      .eq('is_active', true)
      .order('order_index', { ascending: true });

    if (error) {
      console.error('Questions fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 });
    }

    return NextResponse.json({ questions: questions || [] });
  } catch (error) {
    console.error('Questions API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
