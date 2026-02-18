-- =====================================================
-- PAYMENTS SYSTEM & OFFER PURCHASE LOGIC
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Create payments table (Separate from transactions)
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."Users"(id) ON DELETE CASCADE,
    offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL,
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Users can view their own payments
CREATE POLICY "Users can view their own payments"
    ON public.payments FOR SELECT
    USING (auth.uid() = user_id);

-- 2. Stored Procedure for Purchasing an Offer
-- This handles balance check, deduction, payment logging, and enrollment
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
        VALUES (p_user_id, v_course_record.course_id, NOW(), 0.00) -- Split price handling could be added here
        ON CONFLICT (user_id, course_id) DO NOTHING;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Offre achetée avec succès',
        'new_balance', v_user_balance - v_offer_price
    );
END;
$$;

-- Grant permissions
GRANT SELECT ON public.payments TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_offer(UUID, UUID) TO authenticated;

-- Success notice
DO $$
BEGIN
    RAISE NOTICE '✅ Payments system and purchase_offer function created!';
END $$;
