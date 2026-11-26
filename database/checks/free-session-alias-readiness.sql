-- READ ONLY. No student identities, answers, credentials or payment rows are returned.
-- Run in the production database and provide the result for promotion review.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY filename;

SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema=current_schema() AND table_name='free_sessions'
ORDER BY ordinal_position;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('free_sessions'::regclass,'live_sessions'::regclass)
ORDER BY conrelid::regclass::text, conname;

-- Public campaign identifiers only. Existing newly reserved names block migration.
SELECT id, slug, is_active,
  slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  AND char_length(slug) BETWEEN 2 AND 60
  AND slug NOT IN ('admin','api','login','verify','status','questions','submit','register') AS alias_backfill_valid
FROM free_sessions ORDER BY slug;

SELECT to_regclass('free_session_slug_aliases') AS existing_alias_table,
       to_regclass('idx_free_session_slug_aliases_campaign') AS existing_alias_index;

-- INFORMATION ONLY: none of these tables is a dependency of the alias migration.
-- The held funnel uses free_session_reservations; absence is expected before it is applied.
-- The production-reported free_session_registrations must not be renamed or substituted.
SELECT to_regclass('free_session_participants') AS participants,
       to_regclass('free_session_registrations') AS production_reported_registrations,
       to_regclass('session_registrations') AS repository_registration_flow,
       to_regclass('free_session_reservations') AS optional_held_funnel_reservations;

-- These names must not conflict with untracked objects in the migration schema.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname=current_schema()
  AND p.proname IN ('reserve_free_session_slug','preserve_free_session_slug');

SELECT tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE NOT tgisinternal AND tgrelid='free_sessions'::regclass
ORDER BY tgname;

ROLLBACK;
