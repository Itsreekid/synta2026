-- =====================================================
-- FIX BALANCE SECURITY TRIGGER
-- Allows authorized SECURITY DEFINER functions to update balance
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Update the security trigger function
CREATE OR REPLACE FUNCTION prevent_balance_update()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT;
    v_authorized TEXT;
BEGIN
    -- Get current JWT role
    BEGIN
        v_role := current_setting('request.jwt.claims', true)::json->>'role';
    EXCEPTION WHEN OTHERS THEN
        v_role := 'internal'; -- Not a JWT request (e.g. direct SQL)
    END;

    -- Get authorization flag
    v_authorized := current_setting('app.authorized_balance_update', true);

    -- Check if balance is being changed
    IF OLD.balance IS DISTINCT FROM NEW.balance THEN
        -- Allow if:
        -- 1. It's the service_role (backend)
        -- 2. It's an internal authorized update (set by our RPCs)
        -- 3. It's a direct SQL update from a superuser (no JWT claims)
        IF v_role = 'service_role' OR v_authorized = 'true' OR v_role IS NULL OR v_role = 'internal' THEN
            -- Authorized
            NULL;
        ELSE
            -- Blocked
            RAISE EXCEPTION 'Balance can only be updated by the backend system or authorized functions';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update purchase_offer to set the authorization flag
CREATE OR REPLACE FUNCTION public.purchase_offer(
    p_user_id UUID,
    p_offer_id UUID
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_offer_price DECIMAL(10, 2);
    v_user_balance DECIMAL(10, 2);
    v_offer_title TEXT;
    v_course_record RECORD;
BEGIN
    -- AUTHORIZE BALANCE UPDATE for this session locally
    PERFORM set_config('app.authorized_balance_update', 'true', true);

    -- 0. Check if user already purchased this offer
    IF EXISTS (SELECT 1 FROM public.payments WHERE user_id = p_user_id AND offer_id = p_offer_id) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Vous avez déjà acheté cette offre');
    END IF;

    -- 1. Get offer details
    SELECT fixed_price, title INTO v_offer_price, v_offer_title
    FROM public.offers
    WHERE id = p_offer_id AND is_active = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Offre introuvable ou inactive');
    END IF;

    -- 2. Get user balance
    SELECT balance INTO v_user_balance
    FROM public."Users"
    WHERE id = p_user_id;

    IF v_user_balance < v_offer_price THEN
        RETURN jsonb_build_object('success', false, 'message', 'Solde insuffisant');
    END IF;

    -- 3. Deduct balance
    UPDATE public."Users"
    SET balance = balance - v_offer_price
    WHERE id = p_user_id;

    -- 4. Log the payment
    INSERT INTO public.payments (user_id, offer_id, amount, description)
    VALUES (p_user_id, p_offer_id, v_offer_price, 'Achat de l''offre: ' || v_offer_title);

    -- 5. Enroll user in all courses included in the offer
    FOR v_course_record IN 
        SELECT course_id FROM public.offer_courses WHERE offer_id = p_offer_id
    LOOP
        INSERT INTO public.enrollments (user_id, course_id, enrolled_at, amount_paid)
        VALUES (p_user_id, v_course_record.course_id, NOW(), 0.00)
        ON CONFLICT (user_id, course_id) DO NOTHING;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Offre achetée avec succès',
        'new_balance', v_user_balance - v_offer_price
    );
END;
$$;

-- 3. Update existing balance functions to also use the flag
CREATE OR REPLACE FUNCTION add_user_balance(
  p_user_id UUID,
  p_amount DECIMAL(10, 2),
  p_description TEXT DEFAULT 'Balance credit'
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- AUTHORIZE BALANCE UPDATE
  PERFORM set_config('app.authorized_balance_update', 'true', true);

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  UPDATE public."Users"
  SET balance = COALESCE(balance, 0) + p_amount
  WHERE id = p_user_id;
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION deduct_user_balance(
  p_user_id UUID,
  p_amount DECIMAL(10, 2),
  p_description TEXT DEFAULT 'Balance deduction'
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_balance DECIMAL(10, 2);
BEGIN
  -- AUTHORIZE BALANCE UPDATE
  PERFORM set_config('app.authorized_balance_update', 'true', true);

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  SELECT balance INTO v_current_balance FROM public."Users" WHERE id = p_user_id;
  
  IF COALESCE(v_current_balance, 0) < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  
  UPDATE public."Users"
  SET balance = balance - p_amount
  WHERE id = p_user_id;
  
  RETURN TRUE;
END;
$$;

-- Success notice
DO $$
BEGIN
    RAISE NOTICE '✅ Balance security trigger updated to allow authorized RPC calls.';
    RAISE NOTICE '✅ purchase_offer, add_user_balance, and deduct_user_balance updated.';
END $$;
