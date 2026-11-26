> Status 2026-11-26: exact schema approved for local implementation/testing; implementation complete and migration still HELD. Proposal below retained as history. Superseding results: FREE_SESSION_FUNNEL_IMPLEMENTATION.md. Production NO-GO.

# Free-session funnel — gap analysis and held schema proposal (2026-11-25)

Production remains NO-GO. No production SQL, payment activation, commit, push or deploy is authorized.

## Existing implementation

Campaign slugs/default /session, configurable quiz/questions, verified email registration, existing-member participation, server scoring, acquisition badges, protected Zoom joins, calendar and five-minute reminders already exist. Reuse these. Public questions exclude correct_answer. Topics are not modeled; never fabricate strong/weak topics. Tier thresholds currently >=80% elite, >=50% challenger, else explorer; map to Avancé/Intermédiaire/Débutant with a short-diagnostic disclaimer.

## Safe schema-free work now

Refresh the current landing/quiz/results in French, mobile first; retain existing IDs/API contracts and admin editor. Real ordering with touch/keyboard up/down alternatives. Remove unsupported discounts/VIP/Discord promises and compulsory countdown. Save bounded non-sensitive answer drafts in sessionStorage per campaign and verified registration; keep auth proofs in HttpOnly cookies, never in browser storage. Use current membership semantics honestly: no claim of per-occurrence reservation until that schema exists. Preserve email verification; new visitor still verifies before the quiz in this first stage.

Fix lost class/branch by copying validated registration track/filier when campaign targets are absent. Existing students remain unchanged. Require existing local email_verified before automatic Google email linking; leave the original-account verification path for unverified accounts. Do not add a public direct Google funnel button until guest-result linking is implemented/tested. Normal existing sign-in remains available.

## Schema needed, NOT APPROVED / NOT APPLIED

Held file: database/pending-migrations/202611250004_free_session_funnel.sql. Three additive tables and three campaign/live settings:

1. free_session_attempts: immutable question snapshot with private answer key (never sent to browser), submitted answers and server-calculated score/level; hash-only random guest token, 2-hour guest expiry, 48-hour pending-registration claim deadline, optional verified registration and once-only authenticated owner. Append new attempts instead of overwriting earlier quizzes. User/registration FK types follow real production key types.
2. free_session_reservations: primary key (live_session_id,user_id), source attempt and timestamps/status. Exact occurrence entitlement and duplicate prevention; only real authenticated users can reserve. No automatic paid-course enrollment.
3. free_session_occurrence_events: append-only admin create/reschedule/cancel event history. Reliable attendance remains unknown until an audited source exists; do not invent attendance.
4. free_sessions.allow_result_reuse boolean default false and diagnostic_rules JSONB defaults 50/80 percentages with strict validation.
5. live_sessions.free_reservation_required boolean default false. Old sessions keep original campaign-participant access; new occurrence creation sets true and requires an occurrence reservation. Never retroactively revoke old rights.

Reuse live_sessions.id as occurrence ID; no duplicate occurrence/Zoom pipeline. Replace the one-active-per-campaign index with an occurrence/date index after approval. Keep old free_session_participants and registrations unchanged; do not fabricate reservations/attempt timestamps from old campaign membership. Keep original signup source once, append attempts/reservations for later participation. Anonymous scoring/start/claim routes need independent rate limits, 256-bit HttpOnly SameSite token cookie, campaign-scoped snapshot validation, owner/row locks and transactional once-only claim. Guest results must survive verified email or verified Google onboarding via server-side association, not an untrusted userId or client score.

Existing free/multi-audience constraint conflict must be repaired before activation. An additive repair after a failing free migration cannot solve that earlier startup failure: inspect the deployed ledger, never rewrite an already-applied checksum, and approve the compatible pre-free sequence separately. Held funnel migration explicitly refuses to mask that blocker.

## Approval / tests

AGENTS.md rule 1 requires exact schema confirmation. Do not apply held SQL or implement schema-dependent guest/reservation access before owner approval. After approval implement one shared flow, transaction and quote-free accounting (no payment changes), campaign return through validated auth navigation, admin occurrence management within current page, and server-side occurrence permissions across Dashboard/Calendar/join/replays/resources.

Test guest expiry/abuse, proof replay, exactly-once claim, email and verified Google paths, targeted/open profiles, multiple attempts/campaigns/occurrences, duplicate reservations, old data preservation, paid-access isolation, five-minute joining, interrupted flows and 320/375/390/430/768/1440px Chrome. Real Google/Zoom require hosted validation; local mock tests must be labeled.
