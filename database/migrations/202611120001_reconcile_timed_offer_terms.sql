ALTER TABLE offer_access_grants
  ADD COLUMN monthly_boundary_month DATE CHECK (
    monthly_boundary_month IS NULL OR
    (access_mode = 'monthly' AND EXTRACT(DAY FROM monthly_boundary_month) = 1)
  );

ALTER TABLE offer_installment_payments
  ADD COLUMN external_paid_on DATE,
  ADD COLUMN external_receipt_reference TEXT,
  ADD CONSTRAINT installment_external_receipt CHECK (
    (external_paid_on IS NULL AND external_receipt_reference IS NULL)
    OR (source = 'external' AND external_paid_on IS NOT NULL AND external_receipt_reference IS NOT NULL
        AND char_length(external_receipt_reference) BETWEEN 3 AND 120)
  );
CREATE UNIQUE INDEX idx_installment_external_receipt
  ON offer_installment_payments (lower(external_receipt_reference))
  WHERE external_receipt_reference IS NOT NULL;

-- The initial minimum remains mandatory at confirmation. The net paid amount
-- may drop below it when an external entry is subsequently reversed.
ALTER TABLE offer_installment_arrangements
  DROP CONSTRAINT offer_installment_arrangements_check3,
  ADD CONSTRAINT installment_confirmed_not_cancelled CHECK (grant_id IS NULL OR cancelled_at IS NULL);

CREATE TABLE offer_installment_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL UNIQUE REFERENCES offer_installment_payments(id),
  request_id UUID NOT NULL UNIQUE,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
