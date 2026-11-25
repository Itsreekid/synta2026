-- Owner-approved 2026-11-25. Additive settings for FUTURE quotes only.
-- Requires offers installment/minimum columns from 202611120002 and its dependencies.
CREATE FUNCTION valid_offer_custom_installments(plans JSONB,price NUMERIC,minimum NUMERIC,maximum INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE entry RECORD; item JSONB; total NUMERIC; first_amount NUMERIC;
BEGIN
  IF plans IS NULL THEN RETURN TRUE; END IF;
  IF jsonb_typeof(plans)<>'object' OR price IS NULL OR price<=0 THEN RETURN FALSE; END IF;
  FOR entry IN SELECT key,value FROM jsonb_each(plans) LOOP
    IF entry.key NOT IN ('2','3') THEN RETURN FALSE; END IF;
    IF entry.key::int>COALESCE(maximum,1) THEN RETURN FALSE; END IF;
    IF jsonb_typeof(entry.value)<>'array' THEN RETURN FALSE; END IF;
    IF jsonb_array_length(entry.value)<>entry.key::int THEN RETURN FALSE; END IF;
    total:=0;first_amount:=NULL;
    FOR item IN SELECT value FROM jsonb_array_elements(entry.value) LOOP
      IF jsonb_typeof(item)<>'string' THEN RETURN FALSE; END IF;
      IF (item #>> '{}') !~ '^[0-9]{1,8}\.[0-9]{2}$' THEN RETURN FALSE; END IF;
      IF (item #>> '{}')::numeric<=0 THEN RETURN FALSE; END IF;
      IF first_amount IS NULL THEN first_amount:=(item #>> '{}')::numeric; END IF;
      total:=total+(item #>> '{}')::numeric;
    END LOOP;
    IF total<>price OR first_amount<COALESCE(minimum,0) THEN RETURN FALSE; END IF;
  END LOOP;
  RETURN TRUE;
END;
$$;
ALTER TABLE offers ADD COLUMN installment_custom_amounts JSONB;
ALTER TABLE offers ADD CONSTRAINT offers_custom_installment_amounts_valid
  CHECK(valid_offer_custom_installments(installment_custom_amounts,fixed_price,minimum_initial_payment,installment_max));

-- Approved automatic/manual deadlines; existing agreed schedules are untouched.
ALTER TABLE offers ADD COLUMN installment_deadline_mode TEXT NOT NULL DEFAULT 'automatic'
  CHECK (installment_deadline_mode IN ('automatic','manual'));
