> Owner approved this exact alias-table approach for local implementation/testing on 2026-11-26. Implementation complete; SQL remains held. Results and limitations: FREE_CAMPAIGN_FLEXIBILITY_IMPLEMENTATION.md.

# Independent free campaigns — focused completion (2026-11-26)

Existing: any number of campaign rows (no class/section uniqueness), unique public slugs, campaign-scoped questions/results, verified email assignment to users.class/users.branch, independent occurrences/reservations, copy-link action, active status and acquisition badge. Existing users retain profiles; no paid enrollment is granted.

Missing corrections: reject incomplete open-campaign profiles; display configured fields as read-only instead of selection controls; enforce configured targeting for new Google onboarding through the existing guest capability and normal profile-save helper; verify multiple campaigns of the same class through the actual admin API. Preserve all original admin fields and ordinary onboarding.

## Proposed held schema — approval required before execution

File: database/pending-migrations/202611260002_free_session_slug_aliases.sql. Depends only on the approved campaign schema, via original 202611250002 or its compatible replacement. No funnel/financial schema promotion.

One new table: free_session_slug_aliases(slug TEXT PRIMARY KEY with the campaign slug syntax/reserved-name rules, free_session_id UUID NOT NULL REFERENCES free_sessions(id) ON DELETE RESTRICT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()). It reserves both canonical and historical slugs in one unique namespace. Backfill existing canonical slugs only; no student data change.

An AFTER INSERT/UPDATE OF slug trigger atomically reserves each canonical slug; old routes remain mapped to their original campaign. Global primary-key uniqueness prevents concurrent slug hijacking across campaigns. Rename back to a campaign's own old slug is allowed. An immutability trigger prevents alias reassignment/deletion through ordinary SQL. No campaign deletion API is added.

Resolver serves only active campaigns. Old public URLs redirect to the current same-site canonical path (no redirect chains or arbitrary destinations). APIs resolve historical slugs to the same campaign ID, preserving campaign-scoped attempts/cookies/reservations. When migration is absent, slug changes are rejected safely instead of silently breaking shared links; create/read/current-link behavior remains available.

Local tests: old-link redirects and inactive behavior, rename-back, concurrent alias conflicts, reserved/hostile slugs, repeat migration, independent campaign/questions/occurrences, exact profile targeting, legacy/Google signup and duplicate-account protection. Held SQL must not be promoted or applied in production automatically. Production remains NO-GO.
