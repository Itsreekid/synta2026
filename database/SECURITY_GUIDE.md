# Database Security Guide for Synta Academy

## Overview
This document explains the security measures in place and best practices for managing sensitive data like user balances.

## Row Level Security (RLS) Policies

### What is RLS?
Row Level Security is a PostgreSQL feature that restricts which rows users can access based on policies. It's **essential for security** in Supabase applications.

### Current RLS Policies

#### Users Table
```sql
-- SELECT Policy: Users can read their own data
POLICY "Users can view their own profile"
  ✅ Allows: Reading own email, name, balance, etc.
  ❌ Blocks: Reading other users' data

-- UPDATE Policy: Users can update profile (but NOT balance)
POLICY "Users can update their own profile"
  ✅ Allows: Updating own name, phone, etc.
  ⚠️  WARNING: Current implementation doesn't prevent balance manipulation
  🔒 SOLUTION: Use backend functions with service role key
```

## Security Concerns & Solutions

### ⚠️ CRITICAL: Balance Field Security

**The Problem:**
- RLS UPDATE policy allows users to update any field they own
- Users could potentially execute: `UPDATE Users SET balance = 999999 WHERE id = my_id`
- This would give them unlimited balance!

**The Solutions:**

#### Option 1: Backend-Only Balance Updates (RECOMMENDED) ✅
- Never update balance from frontend
- Create a secure backend API endpoint
- Use Supabase Service Role Key (not anon key)
- Validate all balance changes server-side

#### Option 2: Database Functions (GOOD) ✅
- Use the `secure-balance-functions.sql` file
- Functions like `add_user_balance()` run with elevated privileges
- Still requires backend to call them securely

#### Option 3: Stricter RLS Policy (PARTIAL) ⚠️
- PostgreSQL doesn't support column-level RLS easily
- Would need complex triggers
- Not recommended as primary solution

## Implementation Guide

### Current Setup (What you have now)

**Files:**
1. `fix-users-rls.sql` - Basic RLS policies ✅
2. `secure-balance-functions.sql` - Secure balance functions ✅

**Security Status:**
- ✅ Users can only read their own data
- ⚠️ Users might update their balance via browser console
- 🔒 Need backend validation for balance changes

### Recommended Implementation

#### Step 1: Run Both SQL Files
```bash
# In Supabase SQL Editor:
1. Run fix-users-rls.sql
2. Run secure-balance-functions.sql
```

#### Step 2: Backend Balance Updates
For any balance changes, use your backend (Node.js/Express):

```javascript
// backend/routes/balance.js
const { createClient } = require('@supabase/supabase-js');

// Use SERVICE ROLE KEY (keep this secret!)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // NOT the anon key!
);

// Example: Add balance after payment
async function addBalance(userId, amount, description) {
  const { data, error } = await supabase.rpc('add_user_balance', {
    p_user_id: userId,
    p_amount: amount,
    p_description: description
  });
  
  if (error) throw error;
  return data;
}
```

#### Step 3: Never Update Balance from Frontend
```javascript
// ❌ NEVER DO THIS FROM FRONTEND:
await supabaseClient
  .from('Users')
  .update({ balance: newBalance })
  .eq('id', userId);

// ✅ INSTEAD, call your secure backend:
await fetch('/api/add-balance', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${userToken}` },
  body: JSON.stringify({ amount: 100 })
});
```

## Security Checklist

- [x] RLS enabled on Users table
- [x] Users can only read their own data
- [x] Secure functions created for balance management
- [ ] Backend API created for balance operations
- [ ] Service Role Key stored securely (not in frontend)
- [ ] Frontend only reads balance (never updates)
- [ ] Payment processing validates amounts server-side

## For Admin: Manually Updating Balance

If you need to manually adjust a user's balance:

### Option 1: Supabase Dashboard (Quick)
1. Go to Supabase Table Editor
2. Disable RLS temporarily
3. Edit the balance
4. Re-enable RLS immediately

### Option 2: SQL Function (Secure)
```sql
-- Run in SQL Editor:
SELECT set_user_balance(
  'user-uuid-here'::uuid,
  100.00,
  'Initial credit bonus'
);
```

## Important Notes

1. **Service Role Key**: Keep this secret! Never expose in frontend code
2. **Anon Key**: Safe to use in frontend, but limited by RLS policies
3. **Balance Updates**: Always server-side with service role key
4. **Testing**: Test RLS policies with actual user accounts, not admin

## Questions?

If you're unsure about any security aspect, ask before implementing changes to balance logic.
