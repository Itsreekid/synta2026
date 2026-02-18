-- =====================================================
-- TRANSACTION CONFIRMATION & AUTOMATIC BALANCE UPDATE
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Add confirmation column to transactions
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT false;

-- 2. Create the trigger function
CREATE OR REPLACE FUNCTION public.handle_transaction_confirmation()
RETURNS TRIGGER AS $$
BEGIN
    -- Only act when is_confirmed changes from false to true
    IF (OLD.is_confirmed = false AND NEW.is_confirmed = true) THEN
        
        -- Update processed_at timestamp
        NEW.processed_at := NOW();
        
        -- Update status to completed
        NEW.status := 'completed';

        -- Handle Balance Updates
        -- 1. For DEPOSITS (Student buying DT)
        IF NEW.type = 'deposit' THEN
            UPDATE public."Users"
            SET balance = COALESCE(balance, 0) + NEW.amount
            WHERE id = NEW.user_id;
            
        -- 2. For REFUNDS
        ELSIF NEW.type = 'refund' THEN
            UPDATE public."Users"
            SET balance = COALESCE(balance, 0) + NEW.amount
            WHERE id = NEW.user_id;

        -- 3. For WITHDRAWALS (usually already deducted at pending, but this ensures finality)
        -- Note: Usually withdrawals or purchases deduct balance AT THE MOMENT OF REQUEST.
        -- If your system deducts on confirmation instead, uncomment below:
        /*
        ELSIF NEW.type = 'withdrawal' OR NEW.type = 'purchase' THEN
            UPDATE public."Users"
            SET balance = COALESCE(balance, 0) - NEW.amount
            WHERE id = NEW.user_id;
        */
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create the trigger
DROP TRIGGER IF EXISTS tr_on_transaction_confirmed ON public.transactions;
CREATE TRIGGER tr_on_transaction_confirmed
    BEFORE UPDATE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_transaction_confirmation();

-- 4. Help notice
DO $$
BEGIN
    RAISE NOTICE '✅ Transaction confirmation system active!';
    RAISE NOTICE 'When you change is_confirmed to TRUE for a deposit:';
    RAISE NOTICE '  - User balance will increase automatically';
    RAISE NOTICE '  - status will change to completed';
    RAISE NOTICE '  - processed_at will be set to NOW()';
END $$;
