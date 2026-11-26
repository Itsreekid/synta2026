> Promotion/deployment approval received26 November2026. The two migrations are now in database/migrations, byte-identical to the reviewed drafts. Earlier HELD/NO-GO notes below are historical. Activation still requires deployment success and explicit admin occurrence publication; see latest CURRENT_STATE.md.

> Owner approved local implementation and disposable PostgreSQL testing on26 November2026. Implementation: FREE_SESSION_FINAL_FLOW_IMPLEMENTATION.md. New SQL remains pending; no promotion/production authority. Proposal below retained as history.

# Final free-session flow — exact local schema approval requested, 26 November 2026

The existing guest quiz, secure proof, normal users/authentication, reservations, Zoom, calendar and reminders will be reused. No production, commit, push or deployment authorized.

## Proposed additive schema

Exact file: database/pending-migrations/202611260005_free_campaign_public_occurrence.sql.

1. free_sessions.published_occurrence_id nullable UUID. Composite FK guarantees the occurrence belongs to the same campaign. NULL means nothing published. An existing occurrence's ID survives rescheduling. Publishing a different occurrence does not update any historical reservation.
2. free_sessions.target_branches nullable TEXT[]. Existing target_branch stays unchanged. A subset uses target_branches with target_branch=NULL. NULL list preserves current single-section/Toutes behavior. CHECK limits values to existing users.branch vocabulary, forbids null members/multidimensional arrays and conflicting scalar/list settings. Application normalizes duplicate values.
3. Unique live_sessions(free_session_id,id) index supports the ownership FK. No new business table, account system or access grant.

Requires existing approved campaign schema and compatibility repair; full automatic reservation integration additionally requires the already locally approved but HELD 202611250004_free_session_funnel.sql. No original applied SQL/checksum is edited. Both new columns begin NULL. No quizzes, attempts, profiles, reservations, balances, paid access, Zoom references or replay files are rewritten. Keep this new migration pending until separate promotion approval.

## Implementation after local schema approval

- Existing admin occurrence panel gains a clearly marked publication action with confirmation, plus unpublish. Server locks campaign before publishing and validates campaign ownership, status and future eligibility. Students cannot publish or submit a different occurrence ID to bypass the public setting.
- Public metadata exposes only the selected eligible occurrence; no dropdown and no earliest-date guessing. If none is valid, show “La prochaine séance sera annoncée bientôt.” A read-only navy/orange card shows real title/date/time/duration. Remove stale pre-quiz verification copy when guest capability is ready.
- Reservation finalization locks/re-reads the campaign and published occurrence in the same transaction. Ignore or reject conflicting client IDs; use server selection. Keep existing reservations and never silently move them. A publication change during quiz/authentication confirms the currently eligible date, or clearly records no reservation if none remains. Never create a meeting from student signup.
- Logged-in students see their result first, then automatically claim/reserve with existing JWT identity; no profile form. Preserve existing account fields and paid access. Provide confirmation and dashboard/calendar links.
- New visitors register only after result. Existing logged-out accounts sign in via existing safe campaign return and secure guest capability. Single-section values are authoritative; subset campaigns ask only for an allowed section. Normal unrestricted fields still require valid selection. Existing complete profiles are never overwritten.
- No question borrowing across campaigns or fabricated quiz content. Zero active questions shows an honest preparation state, not a perpetual loading cursor.

## Validation and rollback

Disposable PostgreSQL only: fresh chain, supplied legacy ledger/checksums, existing campaign/participant/quiz/reservation snapshots, concurrent publication/claim, malicious IDs, cancel/expiry/unpublish, no paid leak, authenticated/logged-out/email/Google recovery, existing account deduplication, single/subset/Toutes profiles. Chrome at320/375/390/430/768/1440px. Mock external services and label actual provider limits.

Rollback retains additive schema and historical reservations; use compatible application code. No destructive down migration. No local execution of the proposed SQL until explicit approval; no promotion/production execution implied by local approval.
