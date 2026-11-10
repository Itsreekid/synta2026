-- New authoritative offer grants have dedicated statuses. Legacy payments are preserved.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_active_offer
  ON payments (user_id, offer_id)
  WHERE status IN ('wallet_completed', 'admin_authorized');
