ALTER TABLE offers
  ADD COLUMN access_mode TEXT CHECK (access_mode IN ('monthly','academic_year')),
  ADD COLUMN academic_year_start SMALLINT,
  ADD COLUMN access_cutoff_date DATE,
  ADD COLUMN minimum_initial_payment NUMERIC(10,2) CHECK (minimum_initial_payment > 0),
  ADD CONSTRAINT offers_timed_terms CHECK (
    CASE WHEN access_mode = 'academic_year' THEN
      academic_year_start IS NOT NULL AND academic_year_start BETWEEN 2000 AND 9998
      AND access_cutoff_date IS NOT NULL
      AND access_cutoff_date >= make_date(academic_year_start,9,1)
      AND access_cutoff_date < make_date(academic_year_start+1,9,1)
    ELSE academic_year_start IS NULL AND access_cutoff_date IS NULL END
    AND (minimum_initial_payment IS NULL OR
         (access_mode IS NOT NULL AND fixed_price IS NOT NULL AND minimum_initial_payment <= fixed_price))
  );
ALTER TABLE enrollments ADD COLUMN timed_access_only BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE offer_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES offers(id),
  payment_id UUID NOT NULL UNIQUE REFERENCES payments(id),
  request_id UUID NOT NULL,
  request_fingerprint VARCHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  access_mode TEXT NOT NULL CHECK (access_mode IN ('monthly','academic_year')),
  monthly_anchor_day SMALLINT,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > starts_at),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (CASE WHEN access_mode = 'monthly' THEN
      monthly_anchor_day IS NOT NULL AND monthly_anchor_day BETWEEN 1 AND 31
    ELSE monthly_anchor_day IS NULL END),
  UNIQUE (user_id, request_id),
  UNIQUE (user_id, offer_id, starts_at)
);
CREATE INDEX idx_offer_access_user_offer_expiry ON offer_access_grants(user_id, offer_id, expires_at);
CREATE INDEX idx_offer_access_reminder ON offer_access_grants(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE offer_access_grant_courses (
  grant_id UUID NOT NULL REFERENCES offer_access_grants(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (grant_id, course_id)
);
CREATE INDEX idx_offer_access_courses_course ON offer_access_grant_courses(course_id, grant_id);

CREATE TABLE offer_installment_arrangements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES offers(id),
  quoted_price NUMERIC(10,2) NOT NULL CHECK (quoted_price > 0),
  required_initial_payment NUMERIC(10,2) NOT NULL CHECK (required_initial_payment > 0 AND required_initial_payment <= quoted_price),
  quoted_access_mode TEXT NOT NULL CHECK (quoted_access_mode IN ('monthly','academic_year')),
  quoted_academic_year_start SMALLINT,
  quoted_cutoff_date DATE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  grant_id UUID UNIQUE REFERENCES offer_access_grants(id) ON DELETE CASCADE,
  paid_total NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (paid_total BETWEEN 0 AND quoted_price),
  next_due_date DATE,
  CHECK (grant_id IS NOT NULL OR (paid_total = 0 AND next_due_date IS NULL)),
  CHECK (grant_id IS NULL OR (cancelled_at IS NULL AND paid_total >= required_initial_payment)),
  CHECK (paid_total < quoted_price OR next_due_date IS NULL),
  CHECK (CASE WHEN quoted_access_mode = 'academic_year' THEN
      quoted_academic_year_start IS NOT NULL AND quoted_academic_year_start BETWEEN 2000 AND 9998
      AND quoted_cutoff_date IS NOT NULL
      AND quoted_cutoff_date >= make_date(quoted_academic_year_start,9,1)
      AND quoted_cutoff_date < make_date(quoted_academic_year_start+1,9,1)
    ELSE quoted_academic_year_start IS NULL AND quoted_cutoff_date IS NULL END)
);
CREATE UNIQUE INDEX idx_offer_installments_pending ON offer_installment_arrangements(user_id, offer_id)
  WHERE grant_id IS NULL AND cancelled_at IS NULL;
CREATE INDEX idx_offer_installments_student ON offer_installment_arrangements(user_id, created_at DESC);

CREATE TABLE offer_installment_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arrangement_id UUID NOT NULL REFERENCES offer_installment_arrangements(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  request_fingerprint VARCHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  source TEXT NOT NULL CHECK (source IN ('wallet','external')),
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (arrangement_id, request_id)
);
CREATE TABLE offer_installment_deadline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arrangement_id UUID NOT NULL REFERENCES offer_installment_arrangements(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  request_fingerprint VARCHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  previous_due_date DATE,
  new_due_date DATE,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (arrangement_id, request_id)
);
CREATE TABLE offer_academic_calendars (
  academic_year_start SMALLINT PRIMARY KEY CHECK (academic_year_start BETWEEN 2000 AND 9998),
  suggestions JSONB NOT NULL CHECK (jsonb_typeof(suggestions) = 'object'),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN offer_access_grant_id UUID REFERENCES offer_access_grants(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX idx_notifications_offer_access_once ON notifications(offer_access_grant_id)
  WHERE offer_access_grant_id IS NOT NULL;
