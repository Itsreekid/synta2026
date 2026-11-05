# BUSINESS_RULES.md — Synta Academy

> **Last audited:** 2026-11-05  
> **Status legend:**  
> ✅ **IMPLEMENTED** — Verified in source code  
> ⚠️ **PARTIALLY IMPLEMENTED** — Logic exists but incomplete or inconsistent  
> ❌ **NOT IMPLEMENTED** — No code found  
> ❓ **NEEDS CLARIFICATION** — Business decision not documented anywhere

---

## 1. User Roles

### BR-00: Course Content Reuse
| Behavior | Status | Evidence |
|----------|--------|----------|
| One educational module can be included in multiple courses | ✅ | `course_modules` join table; legacy course placements are backfilled by migration |
| A module can have a separate display order in each course | ✅ | `course_modules.order_index` |
| Course access is granted by enrollment in a course that includes the lesson's module | ✅ | `checkLessonAccess()` joins enrollments through `course_modules` |
| Admin interface/API can attach an existing module to another course | ✅ | Admin course chapter manager uses `course_modules` |
| Admin can create lessons and add PDF/Word documents to them | ✅ | Admin API signs R2 uploads; course resource endpoint grants signed read URLs only to enrolled students |
| Admin can upload a live replay for a session | ✅ | Admin API signs R2 uploads; live session endpoint signs private replay keys for entitled students |
| Students only see replays for active course/offer enrollment | ✅ | Live course, upcoming, and replay APIs check enrollment expiry and offer association |
| Admin can place three-question quizzes between lessons with five interactive question styles | ✅ | Admin chapter quiz builder stores structured content; students play the quiz through authenticated lesson content |
| Admin can attach multiple code/practice files to lessons and live sessions | ✅ | Admin supports multi-file selection; authenticated course lesson and replay flows render the associated signed downloads |
| Session replays play in the course and show their associated practice files | ✅ | Course live-session endpoint returns entitled replay URLs and signed session resources; replay modal renders player and downloads |
| Offer-linked courses are shown only to students matching the offer's class and branch targets | ✅ | `GET /api/courses` and `GET /api/courses/:courseId` enforce active offer targeting; active enrollments remain visible |
| Courses with no offer association remain open for discovery and free-course enrollment | ✅ | Catalog and course detail APIs allow published courses with no `offer_courses` mapping |

> Offer access remains course-based through `offer_courses` and enrollments. Reusing a module does not change payment or entitlement rules.

### BR-01: User Roles
Two roles exist: `user` (student) and `admin`.

| Behavior | Status | Evidence |
|----------|--------|----------|
| Default role on registration is `user` | ✅ | `auth-api.js`: INSERT with role='user' |
| Admin can be set via DB UPDATE | ✅ | `server.js` `/api/admin/promote` endpoint |
| Admin can be set via `ADMIN_EMAILS` env var | ✅ | `requireAdmin.js` |
| No `instructor` role exists | ✅ (gap) | No evidence of instructor distinction |
| No `parent` role exists | ✅ (gap) | — |

> ❓ **NEEDS CLARIFICATION:** Should instructors have their own role and dashboard? Currently all content management is done by the single admin.

---

## 2. Student Registration Lifecycle

### BR-02: Standard Registration (Email/Password)
| Behavior | Status | Evidence |
|----------|--------|----------|
| Student registers with email, password, name, phone, class, branch | ✅ | `auth-api.js` POST /api/auth/register |
| Password must be ≥ 6 characters | ✅ | `auth-api.js` |
| Email is lowercased before storage | ✅ | `auth-api.js` |
| Duplicate email is rejected (409) | ✅ | `auth-api.js` |
| Verification email is sent on registration | ✅ | `services/email.js` via Resend |
| Student cannot log in until email is verified | ✅ | `auth-api.js` checks `email_verified` |
| Student can resend verification email | ✅ | `POST /api/auth/resend-verification` |
| Verification token expires in 24 hours | ✅ | `generateVerificationToken()` |

### BR-03: Google Sign-In Registration
| Behavior | Status | Evidence |
|----------|--------|----------|
| Student can sign up / sign in with Google | ✅ | `google-auth.js` |
| Google accounts are pre-verified (no email verification needed) | ✅ | `google-auth.js`: email_verified=true |
| Google login links to existing email/password account | ✅ | `google-auth.js`: UPSERT by email |
| Google users must complete phone/class/branch onboarding | ✅ | `google-auth.js`: needsOnboarding check |
| `GET /auth/complete-profile` redirects to dashboard if already complete | ✅ | `pages.js` |

### BR-04: Placement Quiz Session (Onboarding Alternative)
| Behavior | Status | Evidence |
|----------|--------|----------|
| Student can register for a placement quiz session | ✅ | `POST /api/session/register` |
| Returning students (same email) resume their session | ✅ | `session.js`: check existing |
| Student submits answers to placement questions | ✅ | `POST /api/session/submit` |
| Score determines tier: explorer (<50%), challenger (50-79%), elite (≥80%) | ✅ | `computeTier()` in `session.js` |
| Perfect score → `group = 'advanced'`, otherwise `'beginner'` | ✅ | `session.js` |
| Student sets password to activate account | ✅ | `POST /api/session/set-password` |
| Session registrations are linked to `users` table via `auth_user_id` | ⚠️ | `session_registrations.auth_user_id` column exists but `set-password` does NOT update it after creating user |

> ❓ **NEEDS CLARIFICATION:** The `beginner`/`advanced` group assignment from the placement quiz currently has no effect on course access or live session access. Is this intentional?

---

## 3. Authentication Rules

### BR-05: Session Management
| Behavior | Status | Evidence |
|----------|--------|----------|
| Access token lasts 1 hour | ✅ | `auth-api.js`: expiresIn: "1h" |
| Refresh token lasts 7 days | ✅ | `auth-api.js`: expiresIn: "7d" |
| Refresh token auto-renews access token when it expires | ❌ | No refresh token redemption endpoint or logic found |
| Logout clears both cookies | ✅ | `POST /api/auth/logout` |
| Admin can log in as any student (magic login) | ✅ | `GET /api/auth/magic-login?token=` |
| Magic login tokens expire in 5 minutes | ✅ | `admin-api.js`: expiresIn: '5m' |
| Magic login is logged/audited | ❌ | No audit trail |

---

## 4. Course Catalog Rules

### BR-06: Course Visibility
| Behavior | Status | Evidence |
|----------|--------|----------|
| Only `is_published = true` courses are visible to students | ✅ | `courses.js` WHERE is_published=true |
| Admin can see all courses (published + unpublished) | ✅ | `admin-api.js` no published filter |
| Courses can be categorized (bac-info, bac-math, etc.) | ✅ | `category` field on courses |
| Courses can be filtered by category and level | ✅ | `GET /api/courses?category=&level=` |

### BR-07: Free Courses
| Behavior | Status | Evidence |
|----------|--------|----------|
| `is_free = true` courses can be enrolled without payment | ✅ | `enrollment.js` free-enroll endpoint |
| Free courses bypass balance check | ✅ | `purchase.js` early return for is_free |

### BR-08: Preview Lessons
| Behavior | Status | Evidence |
|----------|--------|----------|
| `is_preview = true` lessons are accessible without enrollment | ✅ | `content.js`: hasAccess = lesson.is_preview |

---

## 5. Enrollment Rules

### BR-09: Enrollment Mechanics
| Behavior | Status | Evidence |
|----------|--------|----------|
| One enrollment per user per course (UNIQUE constraint) | ✅ | `enrollments` UNIQUE (user_id, course_id) |
| Enrollments can expire (`expires_at`) | ✅ | Schema has expires_at; checked in access control |
| NULL `expires_at` = lifetime access | ✅ | `checkLessonAccess()` SQL |
| Enrollment can be linked to an offer (`offer_id`) | ✅ | Schema supports it |
| Admin can manually enroll student in an offer | ✅ | `POST /api/admin/student/:id/enroll-partial` |
| Enrolling in an offer enrolls in all associated courses | ✅ | `admin-api.js` and `purchase.js` |
| When a new course is added to an offer, existing offer students are auto-enrolled | ✅ | `admin-api.js` retroactive enrollment |

### BR-10: Course Access Control
| Behavior | Status | Evidence |
|----------|--------|----------|
| Access to lesson content requires active enrollment | ✅ | `content.js` + `checkLessonAccess()` |
| Access check traverses lesson → module → course → enrollment | ✅ | SQL JOIN in `checkLessonAccess()` |
| Expired enrollments are denied access | ✅ | `expires_at > NOW()` check |

---

## 6. Financial System Rules

### BR-11: Internal Wallet
| Behavior | Status | Evidence |
|----------|--------|----------|
| Each student has an internal balance (TND) | ✅ | `users.balance` field |
| Students can deposit funds by submitting a transaction with proof | ✅ | `POST /api/user/transactions` with receipt |
| Payment receipt is uploaded to Cloudflare R2 | ✅ | `user-api.js` R2 upload logic |
| Admin must confirm deposit before balance is credited | ✅ | `POST /api/admin/payments/:id/confirm` |
| Admin can reject a deposit with an optional reason | ✅ | `POST /api/admin/payments/:id/reject` |
| Balance is credited atomically with confirmation status update | ✅ | Transaction + row lock in admin-api.js |
| Double-confirmation is prevented (status check before processing) | ✅ | `if (tx.status !== 'pending')` guard |
| Admin can correct the confirmed amount | ✅ | `req.body.amount` override in confirm endpoint |

### BR-12: Course Purchase (Balance Deduction)
| Behavior | Status | Evidence |
|----------|--------|----------|
| Student can purchase a course by deducting from balance | ✅ | `POST /api/purchase/course` |
| Balance is checked atomically (FOR UPDATE lock) | ✅ | `purchase.js` |
| Insufficient balance is rejected | ✅ | `purchase.js` |
| Purchase creates enrollment and transaction record | ✅ | `purchase.js` |
| Course purchase requires a valid cookie JWT and uses the authenticated user's ID | ✅ | `purchase.js`: `authApiMiddleware`; `req.user.id` |

### BR-13: Offer Purchase (Balance Deduction)
| Behavior | Status | Evidence |
|----------|--------|----------|
| Student can purchase an offer bundle at fixed price | ✅ | `POST /api/purchase/offer` |
| Offer purchase enrolls in all associated courses | ✅ | `purchase.js` |
| Offer purchase requires a valid cookie JWT and uses the authenticated user's ID | ✅ | `purchase.js`: `authApiMiddleware`; `req.user.id` |

### BR-14: Partial / Installment Enrollment (Admin Only)
| Behavior | Status | Evidence |
|----------|--------|----------|
| Admin can enroll student with partial payment (tranche) | ✅ | `POST /api/admin/student/:id/enroll-partial` |
| Remaining amount is tracked as `debt` on the user | ✅ | `users.debt` field |
| Admin can mark an external payment (cash, etc.) | ✅ | `isExternal` flag |
| Admin can collect debt payments | ✅ | `POST /api/admin/student/:id/pay-debt` |

---

## 7. Offer Rules

### BR-15: Offer Targeting
| Behavior | Status | Evidence |
|----------|--------|----------|
| Offers can be targeted to specific student classes | ✅ | `offers.target_classes` TEXT[] |
| Offers can be targeted to specific student branches | ✅ | `offers.target_branches` TEXT[] |
| Empty target arrays = visible to all | ✅ | Filter logic in `offers.js` |
| Targeting is enforced client-side (filter in API response) | ✅ | `offers.js` filter loop |
| Targeting is NOT enforced at enrollment time | ⚠️ | No check in purchase/enroll endpoints |

### BR-16: Offer Validity
| Behavior | Status | Evidence |
|----------|--------|----------|
| Offers have `valid_from` and `valid_until` date range | ✅ | Schema supports it |
| Expired offers are hidden from listing | ✅ | `enrollment.js` offers endpoint: `valid_until > NOW()` |
| Offer features (live_access, exams, community) are stored as JSONB | ✅ | `offers.features` |

---

## 8. Live Session Rules

### BR-17: Live Session Access
| Behavior | Status | Evidence |
|----------|--------|----------|
| Live sessions are linked to a course | ✅ | `live_sessions.course_id` |
| Students must be enrolled in the course to see its sessions | ✅ | `GET /api/live/upcoming` filters by enrollment |
| Sessions can be restricted to a specific offer | ✅ | `live_sessions.offer_id` filter logic |
| Students see only sessions they have access to | ✅ | `accessible` filter in `live.js` |
| Students can see past sessions with replays | ✅ | `GET /api/live/replays` |
| Enrolled students can see all sessions for a course, including completed sessions waiting for a replay | ✅ | `GET /api/live/course/:courseId` (course and offer enrollment checked) |
| Course details separate chapters from live sessions and group sessions/replays by month | ✅ | Student course UI tabs and collapsible calendar-month sections |
| Course details live count matches the sessions shown to that enrolled student | ✅ | Count is derived from the authenticated course-session response; no random fallback |
| Admin can add or clear a replay URL after teaching | ✅ | `PATCH /api/live/:sessionId/replay` |
| `zoom_start_url` (host link) is never sent to students | ✅ | `live.js`: filtered from response |
| Admin can schedule sessions (single or recurring) | ✅ | `POST /api/live/schedule` |
| Recurring sessions share one Zoom meeting ID | ✅ | `createZoomMeeting({isRecurring})` |
| Admin can delete sessions (also deletes from Zoom) | ✅ | `DELETE /api/live/:sessionId` |

### BR-18: Live Session Attendance
| Behavior | Status | Evidence |
|----------|--------|----------|
| Attendance is tracked per student per session | ❌ | No `live_session_attendance` table |
| Session status updates (live → completed) | ❌ | `status` column exists but no mechanism to update it |

> ❓ **NEEDS CLARIFICATION:** Should Zoom recordings be attached automatically through a webhook, in addition to the new admin replay-link control?

---

## 9. Progress Tracking Rules

### BR-19: Lesson Progress
| Behavior | Status | Evidence |
|----------|--------|----------|
| Each lesson view is recorded in `lesson_progress` | ✅ | `content.js` upsert on lesson access |
| Student can mark a lesson as completed | ✅ | `POST /api/content/lesson/:id/progress` |
| Video resume position is saved | ✅ | `lesson_progress.last_position` |
| Course-level progress % is recalculated on each completion | ✅ | `content.js` and `tracking.js` |
| `enrollments.progress` is kept in sync with `lesson_progress` | ✅ | UPDATE enrollments in tracking route |

### BR-20: Quiz Progress
| Behavior | Status | Evidence |
|----------|--------|----------|
| Quiz responses are saved per question | ✅ | `POST /api/tracking/response` |
| Weak topics are identified from quiz performance | ✅ | `GET /api/tracking/weak-topics` (reads `user_weak_topics`) |
| `user_weak_topics` is populated automatically | ❌ | No trigger/job found that writes to this table |

---

## 10. AI Assistant Rules (Bugi)

### BR-21: Bugi Code Debugger
| Behavior | Status | Evidence |
|----------|--------|----------|
| AI responds in Tunisian Darja (Arabic script) | ✅ | System prompt in `ai-api.js` |
| AI explains code errors in a structured format | ✅ | Prompt template in `ai-api.js` |
| AI ignores instructions injected in student code | ✅ | Prompt includes security instructions |
| `POST /api/ai/debug` requires an authenticated cookie JWT | ✅ | `ai-api.js`: `authApiMiddleware` |
| AI uses Gemini with model fallback chain | ✅ | 3-model fallback in `ai-api.js` |

---

## 11. Admin Rules

### BR-22: Admin Capabilities
| Behavior | Status | Evidence |
|----------|--------|----------|
| Admin can list, search, filter students | ✅ | `GET /api/admin/students` |
| Admin can view student details with enrolled offers | ✅ | `GET /api/admin/student/:id` |
| Admin can delete a student | ✅ | `DELETE /api/admin/student/:id` |
| Admin can change student password | ✅ | `POST /api/admin/change-student-password` |
| Admin can log in as a student (magic login) | ✅ | Token-based impersonation |
| Admin can create/edit courses with module/lesson management | ✅ | Admin panel + API |
| Admin can create/edit offers and link courses | ✅ | Admin panel + API |
| Admin can schedule live Zoom sessions | ✅ | `POST /api/live/schedule` |
| Admin can confirm or reject student deposits | ✅ | Payment confirmation endpoints |
| Admin receives real-time notifications (pending payments, new signups) | ✅ | `GET /api/admin/notifications` polling |
| Admin can configure the placement quiz questions | ✅ | `POST/PATCH/DELETE /api/session/admin/questions` |

### BR-23: Admin Authentication
| Behavior | Status | Evidence |
|----------|--------|----------|
| Admin dashboard HTML is protected server-side | ⚠️ | HTML is served as static file; protection is API-level only |
| Admin must have role='admin' in JWT or be in ADMIN_EMAILS | ✅ | `requireAdmin.js` |
| Admin session uses same cookie system as students | ✅ | Same JWT + HttpOnly cookies |

---

## 12. Unresolved Business Questions

| ID | Question | Impact |
|----|----------|--------|
| BQ-01 | Should there be a `group` table linking students to live sessions (instead of course-based linking)? | HIGH — affects session access architecture |
| BQ-02 | Should the `beginner`/`advanced` classification from the placement quiz affect live session access? | HIGH |
| BQ-03 | What is the lifecycle of an offer? Can it be deactivated without revoking enrollments? | HIGH |
| BQ-04 | What happens to enrolled students when a course is deleted? (Currently CASCADE deletes enrollments) | HIGH |
| BQ-05 | Should session replay URLs be automatically set via Zoom webhooks? | MEDIUM |
| BQ-06 | Should students see their `debt` amount in their wallet? | MEDIUM |
| BQ-07 | Should there be an instructor role separate from admin? | MEDIUM |
| BQ-08 | Is the `payments` table (offer-level) still needed, or is `transactions` the canonical ledger? | MEDIUM |
| BQ-09 | Should `user_weak_topics` be auto-populated via a trigger or background job? | MEDIUM |
| BQ-10 | What happens when a student's enrollment expires? Do they lose access immediately? | HIGH |
| BQ-11 | Can a student belong to multiple groups simultaneously? | MEDIUM |
| BQ-12 | Should live sessions be shareable across multiple offers/groups? | MEDIUM |

