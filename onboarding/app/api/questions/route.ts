import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// RETIRED: this legacy onboarding app used Supabase, which Synta no longer uses.
// The placement test now lives in the main backend (backend/routes/session.js),
// where admin actions require an admin session. Every request here is refused.
function retired() {
  return NextResponse.json(
    { error: "Ce service a été déplacé. Utilisez https://syntaacademy.tn/session" },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}

export const GET = retired;
