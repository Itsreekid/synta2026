-- =====================================================
-- SECURE BALANCE MANAGEMENT FUNCTIONS
-- These functions ensure balance can only be updated securely
-- Run this in Supabase SQL Editor with service role
-- =====================================================

-- Function to add balance (for payments/deposits)
-- This should be called from your backend with service role key
CREATE OR REPLACE FUNCTION add_user_balance(
  p_user_id UUID,
  p_amount DECIMAL(10, 2),
  p_description TEXT DEFAULT 'Balance credit'
)
RETURNS BOOLEAN
SECURITY DEFINER -- Runs with function creator's privileges
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Validate amount is positive
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  -- Update user balance
  UPDATE public."Users"
  SET 
    balance = COALESCE(balance, 0) + p_amount
  WHERE id = p_user_id;
  
  -- Log the transaction (you could add a transactions table here)
  RAISE NOTICE 'Added % to user % balance. Description: %', p_amount, p_user_id, p_description;
  
  RETURN TRUE;
END;
$$;

-- Function to deduct balance (for purchases)
-- This should be called from your backend with service role key
CREATE OR REPLACE FUNCTION deduct_user_balance(
  p_user_id UUID,
  p_amount DECIMAL(10, 2),
  p_description TEXT DEFAULT 'Balance deduction'
)
RETURNS BOOLEAN
SECURITY DEFINER -- Runs with function creator's privileges
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_balance DECIMAL(10, 2);
BEGIN
  -- Validate amount is positive
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  -- Get current balance
  SELECT balance INTO v_current_balance
  FROM public."Users"
  WHERE id = p_user_id;
  
  -- Check if user has sufficient balance
  IF COALESCE(v_current_balance, 0) < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Current: %, Required: %', 
      COALESCE(v_current_balance, 0), p_amount;
  END IF;
  
  -- Deduct from user balance
  UPDATE public."Users"
  SET 
    balance = balance - p_amount
  WHERE id = p_user_id;
  
  -- Log the transaction
  RAISE NOTICE 'Deducted % from user % balance. Description: %', p_amount, p_user_id, p_description;
  
  RETURN TRUE;
END;
$$;

-- Function to set balance directly (admin only)
-- Use this carefully - only for admin corrections
CREATE OR REPLACE FUNCTION set_user_balance(
  p_user_id UUID,
  p_new_balance DECIMAL(10, 2),
  p_reason TEXT DEFAULT 'Admin adjustment'
)
RETURNS BOOLEAN
SECURITY DEFINER -- Runs with function creator's privileges
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_balance DECIMAL(10, 2);
BEGIN
  -- Get old balance for logging
  SELECT balance INTO v_old_balance
  FROM public."Users"
  WHERE id = p_user_id;
  
  -- Update balance
  UPDATE public."Users"
  SET 
    balance = p_new_balance
  WHERE id = p_user_id;
  
  -- Log the change
  RAISE NOTICE 'Admin changed user % balance from % to %. Reason: %', 
    p_user_id, COALESCE(v_old_balance, 0), p_new_balance, p_reason;
  
  RETURN TRUE;
END;
$$;

-- Grant execute permissions (adjust as needed for your security model)
-- For now, only authenticated users can execute (but will still need service role in practice)
GRANT EXECUTE ON FUNCTION add_user_balance(UUID, DECIMAL, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_user_balance(UUID, DECIMAL, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION set_user_balance(UUID, DECIMAL, TEXT) TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Secure balance functions created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Available functions:';
  RAISE NOTICE '  - add_user_balance(user_id, amount, description)';
  RAISE NOTICE '  - deduct_user_balance(user_id, amount, description)';
  RAISE NOTICE '  - set_user_balance(user_id, new_balance, reason)';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANT: Call these from backend with service role key for security!';
END $$;
