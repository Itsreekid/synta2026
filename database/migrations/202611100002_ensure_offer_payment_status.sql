-- Legacy payments tables predate the documented status column.
-- This filename deliberately sorts after Google auth reconciliation and before
-- 202611100003_unique_active_offer_payments.sql, which depends on this column.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
