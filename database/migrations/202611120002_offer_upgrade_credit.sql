ALTER TABLE offers ADD COLUMN installment_max smallint CHECK (installment_max BETWEEN 1 AND 3),
  ADD COLUMN installment_due_offsets integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN upgrades_enabled boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT installment_offset_policy CHECK (
    cardinality(installment_due_offsets)=COALESCE(installment_max,1)-1
    AND (installment_due_offsets[1] IS NULL OR installment_due_offsets[1] BETWEEN 1 AND 366)
    AND (installment_due_offsets[2] IS NULL OR installment_due_offsets[2] BETWEEN 1 AND 366)
    AND (installment_due_offsets[1] IS NULL OR installment_due_offsets[2] IS NULL
         OR installment_due_offsets[1]<installment_due_offsets[2])
  ),
  ADD CONSTRAINT annual_upgrade_destination CHECK (NOT upgrades_enabled OR access_mode IS NOT DISTINCT FROM 'academic_year');

CREATE TABLE offer_upgrade_rules (
  source_offer_id uuid NOT NULL REFERENCES offers(id),
  target_offer_id uuid NOT NULL REFERENCES offers(id),
  allow_partial boolean NOT NULL DEFAULT false,
  PRIMARY KEY (source_offer_id,target_offer_id),
  CHECK (source_offer_id <> target_offer_id)
);
CREATE FUNCTION validate_offer_upgrade_rule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM offers WHERE id=NEW.source_offer_id AND access_mode='monthly')
     OR NOT EXISTS (SELECT 1 FROM offers WHERE id=NEW.target_offer_id AND access_mode='academic_year' AND upgrades_enabled)
  THEN RAISE EXCEPTION 'Invalid upgrade rule' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_offer_upgrade_rule BEFORE INSERT OR UPDATE ON offer_upgrade_rules
FOR EACH ROW EXECUTE FUNCTION validate_offer_upgrade_rule();

CREATE FUNCTION guard_offer_upgrade_mode() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.access_mode='monthly' AND EXISTS (SELECT 1 FROM offer_upgrade_rules WHERE source_offer_id=NEW.id)
     OR NEW.access_mode IS DISTINCT FROM 'academic_year' AND EXISTS (SELECT 1 FROM offer_upgrade_rules WHERE target_offer_id=NEW.id)
  THEN RAISE EXCEPTION 'Remove upgrade rules before changing access mode' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_offer_upgrade_mode BEFORE UPDATE OF access_mode ON offers
FOR EACH ROW EXECUTE FUNCTION guard_offer_upgrade_mode();

CREATE TABLE offer_upgrade_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  source_offer_id uuid REFERENCES offers(id),
  target_offer_id uuid NOT NULL REFERENCES offers(id),
  request_id uuid NOT NULL,
  fingerprint text NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  original_credit numeric(10,2) NOT NULL CHECK (original_credit>=0),
  source_debt numeric(10,2) NOT NULL CHECK (source_debt>=0),
  immediate_paid numeric(10,2) NOT NULL CHECK (immediate_paid>=0),
  UNIQUE(user_id,request_id),
  CHECK (source_offer_id IS NOT NULL OR original_credit=0 AND source_debt=0)
);
ALTER TABLE offer_access_grants ALTER COLUMN payment_id DROP NOT NULL,
  ADD COLUMN upgrade_confirmation_id uuid UNIQUE REFERENCES offer_upgrade_confirmations(id),
  ADD CONSTRAINT grant_single_origin CHECK (num_nonnulls(payment_id,upgrade_confirmation_id)=1);
ALTER TABLE offer_installment_arrangements ADD COLUMN credit_total numeric(10,2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT installment_credit_balance CHECK (credit_total>=0 AND paid_total+credit_total<=quoted_price);
CREATE TABLE offer_installment_schedule (
  arrangement_id uuid NOT NULL REFERENCES offer_installment_arrangements(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 3),
  amount numeric(10,2) NOT NULL CHECK (amount>0),
  due_date date,
  PRIMARY KEY(arrangement_id,position)
);
CREATE TABLE offer_upgrade_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  confirmation_id uuid NOT NULL REFERENCES offer_upgrade_confirmations(id),
  source_grant_id uuid REFERENCES offer_access_grants(id),
  payment_id uuid UNIQUE REFERENCES payments(id),
  installment_payment_id uuid UNIQUE REFERENCES offer_installment_payments(id),
  amount numeric(10,2) NOT NULL CHECK (amount>0),
  CHECK (num_nonnulls(payment_id,installment_payment_id)=1)
);
CREATE TABLE offer_upgrade_corrections (
  claim_id uuid PRIMARY KEY REFERENCES offer_upgrade_claims(id),
  request_id uuid NOT NULL UNIQUE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (char_length(trim(reason)) BETWEEN 1 AND 500),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION validate_offer_upgrade_claim() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM payments WHERE id=NEW.payment_id FOR UPDATE;
  PERFORM 1 FROM offer_installment_payments WHERE id=NEW.installment_payment_id FOR UPDATE;
  IF NOT EXISTS (
    SELECT 1 FROM offer_upgrade_confirmations u JOIN offer_upgrade_rules r
      ON r.source_offer_id=u.source_offer_id AND r.target_offer_id=u.target_offer_id
    WHERE u.id=NEW.confirmation_id
  ) THEN RAISE EXCEPTION 'Missing upgrade rule' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM offer_upgrade_confirmations u JOIN offers o ON o.id=u.source_offer_id
    JOIN payments p ON p.offer_id=o.id AND p.user_id=u.user_id
    WHERE u.id=NEW.confirmation_id AND NEW.source_grant_id IS NULL
      AND o.access_mode IS DISTINCT FROM 'monthly' AND p.id=NEW.payment_id
      AND p.status='wallet_completed' AND p.amount=NEW.amount
      AND NOT EXISTS (SELECT 1 FROM offer_access_grants g WHERE g.payment_id=p.id)
  ) AND NOT EXISTS (
    SELECT 1 FROM offer_access_grants g JOIN offers o ON o.id=g.offer_id
    JOIN offer_upgrade_confirmations u ON u.id=NEW.confirmation_id
    WHERE g.id=NEW.source_grant_id AND g.user_id=u.user_id AND g.offer_id=u.source_offer_id
      AND g.access_mode<>'monthly' AND o.access_mode IS DISTINCT FROM 'monthly' AND g.revoked_at IS NULL
      AND (EXISTS (SELECT 1 FROM payments p WHERE p.id=NEW.payment_id AND p.id=g.payment_id
                    AND p.status='timed_wallet_completed' AND p.amount=NEW.amount)
           OR EXISTS (SELECT 1 FROM offer_installment_payments p
                      JOIN offer_installment_arrangements a ON a.id=p.arrangement_id
                      WHERE p.id=NEW.installment_payment_id AND a.grant_id=g.id AND a.credit_total=0
                        AND p.amount=NEW.amount AND NOT EXISTS (
                          SELECT 1 FROM offer_installment_reversals r WHERE r.payment_id=p.id)))
  ) THEN RAISE EXCEPTION 'Invalid credit evidence' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_offer_upgrade_claim BEFORE INSERT OR UPDATE ON offer_upgrade_claims
FOR EACH ROW EXECUTE FUNCTION validate_offer_upgrade_claim();
CREATE FUNCTION guard_claimed_installment_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM offer_installment_payments WHERE id=NEW.payment_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM offer_upgrade_claims c WHERE c.installment_payment_id=NEW.payment_id
             AND NOT EXISTS (SELECT 1 FROM offer_upgrade_corrections r WHERE r.claim_id=c.id))
  THEN RAISE EXCEPTION 'Correct the allocated credit first' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_claimed_installment_reversal BEFORE INSERT ON offer_installment_reversals
FOR EACH ROW EXECUTE FUNCTION guard_claimed_installment_reversal();

CREATE FUNCTION guard_claimed_offer_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM offer_upgrade_claims c WHERE c.payment_id=OLD.id
             AND NOT EXISTS (SELECT 1 FROM offer_upgrade_corrections r WHERE r.claim_id=c.id))
  THEN RAISE EXCEPTION 'Correct the allocated credit first' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_claimed_offer_payment BEFORE UPDATE OF amount,status,user_id,offer_id OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION guard_claimed_offer_payment();

CREATE FUNCTION keep_timed_grant_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.access_mode IS DISTINCT FROM OLD.access_mode OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
     OR NEW.upgrade_confirmation_id IS DISTINCT FROM OLD.upgrade_confirmation_id
  THEN RAISE EXCEPTION 'Timed grant origin is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER keep_timed_grant_origin BEFORE UPDATE OF access_mode,payment_id,upgrade_confirmation_id ON offer_access_grants
FOR EACH ROW EXECUTE FUNCTION keep_timed_grant_origin();

CREATE VIEW offer_installment_schedule_balances AS
SELECT s.arrangement_id,s.position,s.amount,s.due_date,
       greatest(0,least(s.amount,s.cumulative-a.paid_total-a.credit_total))::numeric(10,2) AS remaining
FROM (SELECT *,sum(amount) OVER (PARTITION BY arrangement_id ORDER BY position) AS cumulative
      FROM offer_installment_schedule) s
JOIN offer_installment_arrangements a ON a.id=s.arrangement_id;
