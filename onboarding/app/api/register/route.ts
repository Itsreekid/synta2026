import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Guard: catch missing/placeholder service key immediately
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === 'REPLACE_WITH_REAL_SERVICE_ROLE_KEY') {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY is missing or still the placeholder value.');
    console.error('   → Open onboarding/.env.local and replace it with the real key from:');
    console.error('   → Supabase Dashboard → Settings → API → service_role (secret)');
    return NextResponse.json(
      { error: 'Server misconfiguration: service role key not set. Check server logs.' },
      { status: 500 }
    );
  }

  try {
    const { full_name, email, phone } = await req.json();

    if (!full_name || !email || !phone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if user already exists
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('session_registrations')
      .select('id, full_name, email, track, tier, score, completed')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existing && !fetchError) {
      return NextResponse.json({ success: true, returning: true, registration: existing });
    }

    // New user — create registration
    const { data: registration, error: insertError } = await supabaseAdmin
      .from('session_registrations')
      .insert({
        full_name: full_name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Registration insert error:', insertError.message, insertError.details);
      return NextResponse.json({ error: 'Registration failed: ' + insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, returning: false, registration });
  } catch (error) {
    console.error('❌ Register API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
