-- =====================================================
-- TRANSACTIONS TABLE SCHEMA
-- For tracking all financial transactions (deposits, purchases, etc.)
-- Run this in Supabase SQL Editor
-- =====================================================

-- Create transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."Users"(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'deposit', 'purchase', 'withdrawal', 'refund'
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'completed'
    payment_method VARCHAR(100), -- 'E-dinar', 'D17', 'Bank Transfer', 'Online Payment', etc.
    transaction_code VARCHAR(100) UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT transactions_amount_positive CHECK (amount > 0),
    CONSTRAINT transactions_type_valid CHECK (type IN ('deposit', 'purchase', 'withdrawal', 'refund')),
    CONSTRAINT transactions_status_valid CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled'))
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);

-- Enable Row Level Security
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can insert their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Only admins can update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Only admins can delete transactions" ON public.transactions;

-- RLS Policies
-- Users can view their own transactions
CREATE POLICY "Users can view their own transactions"
    ON public.transactions
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can create their own pending transactions (deposits)
CREATE POLICY "Users can insert their own transactions"
    ON public.transactions
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id 
        AND type = 'deposit' 
        AND status = 'pending'
    );

-- Only service role can update transactions (for admin approval)
CREATE POLICY "Only admins can update transactions"
    ON public.transactions
    FOR UPDATE
    USING (false); -- Prevent all updates from client, only backend can update

-- Only service role can delete transactions
CREATE POLICY "Only admins can delete transactions"
    ON public.transactions
    FOR DELETE
    USING (false); -- Prevent all deletes from client

-- Grant permissions
GRANT SELECT, INSERT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Transactions table created successfully!';
    RAISE NOTICE '';
    RAISE NOTICE 'Table structure:';
    RAISE NOTICE '  - id: UUID (primary key)';
    RAISE NOTICE '  - user_id: UUID (foreign key to Users)';
    RAISE NOTICE '  - amount: DECIMAL(10, 2)';
    RAISE NOTICE '  - type: VARCHAR(50) - deposit, purchase, withdrawal, refund';
    RAISE NOTICE '  - status: VARCHAR(50) - pending, approved, rejected, completed, cancelled';
    RAISE NOTICE '  - payment_method: VARCHAR(100)';
    RAISE NOTICE '  - transaction_code: VARCHAR(100) UNIQUE';
    RAISE NOTICE '  - description: TEXT';
    RAISE NOTICE '  - created_at: TIMESTAMP';
    RAISE NOTICE '  - processed_at: TIMESTAMP';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Row Level Security enabled!';
    RAISE NOTICE '  - Users can view and create their own pending deposits';
    RAISE NOTICE '  - Only backend (service role) can approve/update transactions';
END $$;
