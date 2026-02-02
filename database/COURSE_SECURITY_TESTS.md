# Course Security Tests - Browser Console

Use these tests to verify that users cannot manipulate course prices or content.

## Test 1: Try to View Courses (Should Work)
```javascript
(async () => {
  console.log('📚 Testing: View published courses...\n');
  
  const { data, error } = await window.supabaseClient
    .from('courses')
    .select('id, title, price, is_free, is_published')
    .limit(1);
  
  if (error) {
    console.log('❌ Cannot view courses:', error.message);
  } else {
    console.log('✅ Can view courses:', data);
    // Save first course ID for next tests
    if (data.length > 0) {
      window.testCourseId = data[0].id;
      console.log('💾 Saved course ID for testing:', window.testCourseId);
    }
  }
})();
```

**Expected:** ✅ Should show courses

---

## Test 2: Try to Change Course Price (Should Fail)
```javascript
// First run Test 1 to get a course ID
(async () => {
  if (!window.testCourseId) {
    console.log('❌ Run Test 1 first to get a course ID');
    return;
  }
  
  console.log('🔒 Testing: Change course price to 0.01...\n');
  
  const { data, error } = await window.supabaseClient
    .from('courses')
    .update({ price: 0.01 })
    .eq('id', window.testCourseId);
  
  if (error) {
    console.log('✅ SECURE! Price change blocked!');
    console.log('🔒 Error:', error.message);
  } else {
    console.log('❌ INSECURE! Price was changed!');
    console.log('🚨 SECURITY VULNERABILITY!');
  }
})();
```

**Expected:** ✅ Error: "Course price, is_free, and is_published can only be updated by the backend system"

---

## Test 3: Try to Set Course to Free (Should Fail)
```javascript
(async () => {
  if (!window.testCourseId) {
    console.log('❌ Run Test 1 first to get a course ID');
    return;
  }
  
  console.log('🔒 Testing: Set course to free...\n');
  
  const { data, error } = await window.supabaseClient
    .from('courses')
    .update({ is_free: true })
    .eq('id', window.testCourseId);
  
  if (error) {
    console.log('✅ SECURE! is_free change blocked!');
    console.log('🔒 Error:', error.message);
  } else {
    console.log('❌ INSECURE! is_free was changed!');
    console.log('🚨 SECURITY VULNERABILITY!');
  }
})();
```

**Expected:** ✅ Blocked

---

## Test 4: Try to Create a New Course (Should Fail)
```javascript
(async () => {
  console.log('🔒 Testing: Create a fake free course...\n');
  
  const { data, error } = await window.supabaseClient
    .from('courses')
    .insert({
      title: 'Hacked Free Course',
      description: 'This should not work',
      category: 'hacked',
      price: 0.00,
      is_free: true,
      is_published: true
    });
  
  if (error) {
    console.log('✅ SECURE! Course creation blocked!');
    console.log('🔒 Error:', error.message);
  } else {
    console.log('❌ INSECURE! Course was created!');
    console.log('🚨 CRITICAL SECURITY VULNERABILITY!');
  }
})();
```

**Expected:** ✅ Error: "Only backend can create courses"

---

## Test 5: Try to Delete a Course (Should Fail)
```javascript
(async () => {
  if (!window.testCourseId) {
    console.log('❌ Run Test 1 first to get a course ID');
    return;
  }
  
  console.log('🔒 Testing: Delete a course...\n');
  
  const { data, error } = await window.supabaseClient
    .from('courses')
    .delete()
    .eq('id', window.testCourseId);
  
  if (error) {
    console.log('✅ SECURE! Course deletion blocked!');
    console.log('🔒 Error:', error.message);
  } else {
    console.log('❌ INSECURE! Course was deleted!');
    console.log('🚨 CRITICAL SECURITY VULNERABILITY!');
  }
})();
```

**Expected:** ✅ Error: "Only backend can delete courses"

---

## Test 6: Comprehensive Security Test
```javascript
(async () => {
  console.log('🧪 Running comprehensive course security tests...\n');
  
  // Get a course
  const { data: courses } = await window.supabaseClient
    .from('courses')
    .select('id, title, price, is_free')
    .limit(1);
  
  if (!courses || courses.length === 0) {
    console.log('❌ No courses found for testing');
    return;
  }
  
  const course = courses[0];
  console.log('Testing course:', course.title, '\n');
  
  // Test 1: Update price
  console.log('Test 1: Update price to 0.01');
  const test1 = await window.supabaseClient
    .from('courses')
    .update({ price: 0.01 })
    .eq('id', course.id);
  console.log(test1.error ? '✅ Blocked' : '❌ VULNERABLE', test1.error?.message);
  
  // Test 2: Set to free
  console.log('\nTest 2: Set is_free to true');
  const test2 = await window.supabaseClient
    .from('courses')
    .update({ is_free: true })
    .eq('id', course.id);
  console.log(test2.error ? '✅ Blocked' : '❌ VULNERABLE', test2.error?.message);
  
  // Test 3: Publish/unpublish
  console.log('\nTest 3: Change is_published');
  const test3 = await window.supabaseClient
    .from('courses')
    .update({ is_published: false })
    .eq('id', course.id);
  console.log(test3.error ? '✅ Blocked' : '❌ VULNERABLE', test3.error?.message);
  
  // Test 4: Update allowed fields (like description)
  console.log('\nTest 4: Update description (non-critical field)');
  const test4 = await window.supabaseClient
    .from('courses')
    .update({ description: 'Hacked description' })
    .eq('id', course.id);
  console.log(test4.error ? '✅ Blocked' : '⚠️ May be allowed', test4.error?.message);
  
  // Test 5: Insert new course
  console.log('\nTest 5: Insert new course');
  const test5 = await window.supabaseClient
    .from('courses')
    .insert({ 
      title: 'Hacked Course', 
      category: 'test',
      price: 0,
      is_free: true 
    });
  console.log(test5.error ? '✅ Blocked' : '❌ VULNERABLE', test5.error?.message);
  
  // Test 6: Delete course
  console.log('\nTest 6: Delete course');
  const test6 = await window.supabaseClient
    .from('courses')
    .delete()
    .eq('id', course.id);
  console.log(test6.error ? '✅ Blocked' : '❌ VULNERABLE', test6.error?.message);
  
  console.log('\n--- SECURITY SUMMARY ---');
  const allSecure = test1.error && test2.error && test3.error && test5.error && test6.error;
  if (allSecure) {
    console.log('✅ ✅ ✅ ALL TESTS PASSED - COURSES ARE SECURE!');
  } else {
    console.log('❌ ❌ ❌ SECURITY VULNERABILITIES FOUND!');
  }
})();
```

---

## Security Interpretation

### ✅ ALL SECURE (Expected Results)
- Test 1: Blocked - Cannot change price
- Test 2: Blocked - Cannot set to free
- Test 3: Blocked - Cannot change published status
- Test 4: May be blocked or allowed (non-critical)
- Test 5: Blocked - Cannot create courses
- Test 6: Blocked - Cannot delete courses

### ❌ VULNERABLE (Run SQL Fix Immediately)
If any critical test (1, 2, 3, 5, 6) passes, run `SECURE_COURSES_TABLE.sql` immediately!

---

## Additional Tests for Other Tables

### Test Modules Security
```javascript
(async () => {
  console.log('🔒 Testing modules security...\n');
  
  const { data, error } = await window.supabaseClient
    .from('modules')
    .insert({ 
      title: 'Hacked Module',
      course_id: window.testCourseId,
      order_index: 999
    });
  
  console.log(error ? '✅ SECURE - Cannot create module' : '❌ VULNERABLE - Module created!');
  console.log('Error:', error?.message);
})();
```

### Test Lessons Security
```javascript
(async () => {
  console.log('🔒 Testing lessons security...\n');
  
  // First get a module
  const { data: modules } = await window.supabaseClient
    .from('modules')
    .select('id')
    .limit(1);
  
  if (!modules || modules.length === 0) {
    console.log('No modules found for testing');
    return;
  }
  
  const { data, error } = await window.supabaseClient
    .from('lessons')
    .insert({ 
      title: 'Hacked Lesson',
      module_id: modules[0].id,
      order_index: 999,
      is_preview: true
    });
  
  console.log(error ? '✅ SECURE - Cannot create lesson' : '❌ VULNERABLE - Lesson created!');
  console.log('Error:', error?.message);
})();
```

---

**Run these tests after applying the SECURE_COURSES_TABLE.sql file!**
