# Balance Security Test - Browser Console

Use these code snippets in your browser console (F12) while logged into your platform to test if balance manipulation is possible.

## Test 1: Check Current Balance
```javascript
// Get your current user and balance
(async () => {
  const { data: { user } } = await window.supabaseClient.auth.getUser();
  console.log('👤 Current User ID:', user.id);
  
  const { data, error } = await window.supabaseClient
    .from('Users')
    .select('balance, email')
    .eq('id', user.id)
    .single();
  
  if (error) {
    console.error('❌ Error reading balance:', error);
  } else {
    console.log('💰 Current Balance:', data.balance);
    console.log('📧 Email:', data.email);
  }
})();
```

**Expected Result:** ✅ Should show your current balance

---

## Test 2: Try to Increase Balance (SECURITY TEST)
```javascript
// ⚠️ WARNING: This is a security test!
// If this works, your balance is NOT secure
(async () => {
  const { data: { user } } = await window.supabaseClient.auth.getUser();
  
  console.log('🔒 Attempting to update balance to 99999.99...');
  
  const { data, error } = await window.supabaseClient
    .from('Users')
    .update({ balance: 99999.99 })
    .eq('id', user.id)
    .select();
  
  if (error) {
    console.log('✅ SECURE: Balance update blocked!');
    console.log('🔒 Error:', error.message);
    console.log('📋 Code:', error.code);
  } else {
    console.log('⚠️ INSECURE: Balance was updated!');
    console.log('🚨 SECURITY RISK: Users can change their own balance!');
    console.log('💰 New balance:', data);
  }
})();
```

**Expected Results:**
- ✅ **SECURE:** Error message like "new row violates row-level security policy" or permission denied
- ❌ **INSECURE:** Balance updated successfully (SECURITY PROBLEM!)

---

## Test 3: Try Different Update Methods
```javascript
// Test multiple update attempts
(async () => {
  const { data: { user } } = await window.supabaseClient.auth.getUser();
  
  console.log('🧪 Running comprehensive security tests...\n');
  
  // Test 1: Direct balance update
  console.log('Test 1: Direct balance update');
  const test1 = await window.supabaseClient
    .from('Users')
    .update({ balance: 99999.99 })
    .eq('id', user.id);
  console.log(test1.error ? '✅ Blocked' : '❌ VULNERABLE', test1.error?.message || 'Updated!');
  
  // Test 2: Update with other fields
  console.log('\nTest 2: Update balance with name');
  const test2 = await window.supabaseClient
    .from('Users')
    .update({ 
      full_name: 'Test User',
      balance: 88888.88 
    })
    .eq('id', user.id);
  console.log(test2.error ? '✅ Blocked' : '❌ VULNERABLE', test2.error?.message || 'Updated!');
  
  // Test 3: Increment balance
  console.log('\nTest 3: Increment balance');
  const test3 = await window.supabaseClient.rpc('add_user_balance', {
    p_user_id: user.id,
    p_amount: 1000.00,
    p_description: 'Test increment'
  });
  console.log(test3.error ? '⚠️ Function error' : '✅ Function worked', test3.error?.message || test3.data);
  
  // Final check
  console.log('\n--- Final Balance Check ---');
  const { data } = await window.supabaseClient
    .from('Users')
    .select('balance')
    .eq('id', user.id)
    .single();
  console.log('💰 Current Balance:', data?.balance);
})();
```

---

## Test 4: Check RLS Status
```javascript
// Check if RLS is enabled (requires service role or specific permissions)
(async () => {
  console.log('🔍 Checking table permissions...\n');
  
  const { data: { user } } = await window.supabaseClient.auth.getUser();
  
  // Try to read another user's data (should fail)
  console.log('Test: Trying to read another user\'s balance...');
  const { data, error } = await window.supabaseClient
    .from('Users')
    .select('balance, email')
    .neq('id', user.id)  // Try to get OTHER users
    .limit(1);
  
  if (error || !data || data.length === 0) {
    console.log('✅ SECURE: Cannot read other users\' data');
    console.log('Error:', error?.message || 'No data returned');
  } else {
    console.log('❌ INSECURE: Can read other users\' data!');
    console.log('🚨 CRITICAL SECURITY ISSUE!');
    console.log('Data:', data);
  }
})();
```

**Expected Result:** ✅ Should not return any data (RLS blocking access to other users)

---

## Interpretation Guide

### ✅ SECURE Configuration
```
Test 2 Result: "new row violates row-level security policy"
or "permission denied for table Users"
```
- Balance updates are blocked ✅
- RLS policies working correctly ✅
- Platform is secure ✅

### ❌ INSECURE Configuration
```
Test 2 Result: Balance updated successfully
```
- Users can manipulate balance ❌
- IMMEDIATE ACTION REQUIRED ❌
- Run fix-users-rls.sql NOW ❌

### ⚠️ PARTIALLY SECURE
```
Test 2: Blocked
Test 3: Works
```
- Direct updates blocked ✅
- Functions work (by design) ⚠️
- Make sure functions are only callable from backend ⚠️

---

## After Testing

1. **If tests show INSECURE:** Run `fix-users-rls.sql` immediately
2. **If tests show SECURE:** You're good! Balance is protected
3. **If you can read other users:** Critical RLS issue - contact support

## Reset Your Balance (if you changed it during testing)

```javascript
// If you accidentally changed your balance, you'll need admin access
// Contact your database admin or use Supabase dashboard to reset it
```

---

**Note:** These tests should be performed in a development/testing environment first!
