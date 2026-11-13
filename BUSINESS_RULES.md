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
| One course can be linked to multiple offers; a matching student can see it through any linked offer | ✅ | Admin course editor submits multiple `offers_ids`; `offer_courses` stores the course/offer links; catalog visibility uses an `EXISTS` match |
| Course access is granted by enrollment in a course that includes the lesson's module | ✅ | `checkLessonAccess()` joins enrollments through `course_modules` |
| Admin interface/API can attach an existing module to another course | ✅ | Admin course chapter manager uses `course_modules` |
| Admin can attach multiple supported teaching resources to a lesson in one resource area | ✅ | Course chapter manager accepts multiple files through learning_resources; legacy lesson PDFs remain visible; student resource endpoint returns signed links only to entitled students |
| Admin can upload a live replay for a session | ✅ | Admin API signs R2 uploads; live session endpoint signs private replay keys for entitled students |
| Students only see replays for active course/offer enrollment | ✅ | Live course, upcoming, and replay APIs check enrollment expiry and offer association |
| Admin can place three-question quizzes between lessons with five interactive question styles | ✅ | Admin chapter quiz builder stores structured content; students play the quiz through authenticated lesson content |
| Admin can attach multiple code/practice files to lessons and live sessions | ✅ | Admin supports multi-file selection; authenticated course lesson and replay flows render the associated signed downloads |
| Students can download lesson practice files or open Python exercises in Code Pratique | ✅ | Lesson access or live-session enrollment is checked before the authenticated server reads a Python attachment into the editor; downloads retain signed resource URLs |
| Lesson resources support common documents, slides, spreadsheets, images, code, notes, and ZIP files | ✅ | Admin upload API validates the supported extension and MIME-type allowlists; downloads and PDF previews use private signed R2 URLs |
| Session replays play in the course and show their associated practice files | ✅ | Course live-session endpoint returns entitled replay URLs and signed session resources; replay and lesson share the in-page player and course sidebar |
| Offer-linked courses are shown only to students matching the offer's class and branch targets | ✅ | `GET /api/courses` and `GET /api/courses/:courseId` enforce active offer targeting; active enrollments remain visible |
| Courses with no offer association remain open for discovery and free-course enrollment | ✅ | Catalog and course detail APIs allow published courses with no `offer_courses` mapping |

> Offer access remains course-based through `offer_courses` and enrollments. Reusing a module does not change payment or entitlement rules.

### BR-01: User Roles
Two roles exist: `user` (student) and `admin`.

| Behavior | Status | Evidence |
|----------|--------|----------|
| Default role on registration is `user` | ✅ | `auth-api.js`: INSERT with role='user' |
| Admin access is granted by an authorized operator | ✅ | Set the account role directly in PostgreSQL or configure `ADMIN_EMAILS`. |
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
| French signup separates account information and learning profile | ✅ | Two-step form. School year and section use existing schema values; independent learners use other/other. |
| Profile selections and Tunisian phone numbers are validated on the server | ✅ | Shared learnerProfile validation for email signup and Google onboarding. |

### BR-03: Google Sign-In Registration
| Behavior | Status | Evidence |
|----------|--------|----------|
| Student can sign up / sign in with Google | ✅ | `google-auth.js` |
| Google accounts are pre-verified (no email verification needed) | ✅ | `google-auth.js`: email_verified=true |
| Google login can link an existing email/password account | ✅ | A verified Gmail or Google Workspace address can link an account without a Google identity. Previously linked accounts are matched by Google subject. |
| Google users must complete phone/class/branch onboarding | ✅ | `google-auth.js`: needsOnboarding check |
| `GET /auth/complete-profile` redirects to dashboard if already complete | ✅ | `pages.js` |

### BR-04: Placement Quiz Session (Onboarding Alternative)
| Behavior | Status | Evidence |
|----------|--------|----------|
| Student can register for a placement quiz session | ✅ | `POST /api/session/register` returns the same generic response for valid addresses. A confirmation email enables the quiz for new users. Existing accounts use login. |
| Returning students (same email) resume their session | ✅ | `session.js`: check existing |
| Student submits answers to placement questions | ✅ | `POST /api/session/submit` |
| Score determines tier: explorer (<50%), challenger (50-79%), elite (≥80%) | ✅ | `computeTier()` in `session.js` |
| Perfect score → `group = 'advanced'`, otherwise `'beginner'` | ✅ | `session.js` |
| Student sets password to activate account | ✅ | Requires email verification, completed quiz and a single activation. Existing user credentials are never overwritten. |
| Session registrations are linked to `users` table via `auth_user_id` | ✅ | Activation sets the link and creates the verified account in one transaction. |

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
| Legacy enrollment cannot authorize a paid purchase | ✅ | Paid requests to `/api/enrollment/enroll` return 403. The wallet course endpoint ignores payment references and client prices. |
| Course purchase requires a valid cookie JWT and uses the authenticated user's ID | ✅ | `purchase.js`: `authApiMiddleware`; `req.user.id` |

### BR-13: Offer Purchase (Balance Deduction)
| Behavior | Status | Evidence |
|----------|--------|----------|
| Student can purchase an offer bundle at fixed price | ✅ | `POST /api/purchase/offer` |
| Offer purchase enrolls in all associated courses | ✅ | `purchase.js` |
| Repeated active offer purchases do not debit again | ✅ | User row lock, durable offer payment record and partial unique index. The authenticated user/offer pair is the idempotency key. Repeat requests return success with `alreadyPurchased`. |
| Offer benefits are independent of course ownership | ✅ | Each new purchase or admin installment grant has its own `payments` row. Overlapping offers share a course enrollment. |
| Legacy offer enrollments preserve existing access | ✅ | Active `enrollments.offer_id` remain a fallback unless an explicit revoked payment exists. Historical charges without reliable offer IDs require operator review. |
| Offer sale dates do not expire purchased access | ✅ | Checkout enforces sale dates. Access follows active grant status and course enrollment expiry. Refund/cancellation operations must revoke the offer grant and evaluate course entitlement separately. |
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
| Admins see all offers and can change activation | ✅ | Admin list stays unfiltered. The status endpoint updates only is_active. |
| Inactive offers cannot be purchased as new offers | ✅ | Student checkout checks is_active. Existing payments and course enrollments remain valid under their existing rules. |
| Overview active offer count follows is_active | ✅ | The KPI counts enabled flags; sale dates remain separate checkout conditions. |
| Offer features (live_access, exams, community) are stored as JSONB | ✅ | `offers.features` |

---

## 8. Live Session Rules

### BR-17: Live Session Access
| Behavior | Status | Evidence |
|----------|--------|----------|
| Live sessions are linked to a course | ✅ | `live_sessions.course_id` |
| Students must be enrolled in the course to see its sessions | ✅ | `GET /api/live/upcoming` filters by enrollment |
| Sessions can be restricted to a specific offer | ✅ | `live_sessions.offer_id` filter logic |
| Admins can select one or more eligible students for a session | ✅ | A per-session audience further restricts the session, calendar entry, replay, and resources. Active course and optional offer enrollment are required. |
| Students see only sessions they have access to | ✅ | `accessible` filter in `live.js` |
| Students can see past sessions with replays | ✅ | `GET /api/live/replays` |
| Enrolled students can see all sessions for a course, including completed sessions waiting for a replay | ✅ | `GET /api/live/course/:courseId` (course and offer enrollment checked) |
| Course details separate chapters from live sessions and group sessions/replays by month | ✅ | Student course UI tabs and collapsible calendar-month sections |
| Course details live count matches the sessions shown to that enrolled student | ✅ | Count is derived from the authenticated course-session response; no random fallback |
| Admin can add or clear a replay URL after teaching | ✅ | `PATCH /api/live/:sessionId/replay` |
| `zoom_start_url` (host link) is never sent to students | ✅ | `live.js`: filtered from response |
| Admin host launch uses a protected page redirect | ✅ | Admin session JSON exposes only host-link availability. `GET /admin/sessions/:sessionId/host` requires `requireAdmin`. |
| Admin can schedule sessions (single or recurring) | ✅ | `POST /api/live/schedule` |
| Recurring sessions share one Zoom meeting ID | ✅ | Existing no-fixed-time recurring meetings retain their shared join link. |
| Admin can cancel a date or the remaining series | ✅ | `DELETE /api/live/:sessionId` cancels one local occurrence. `?series=true` cancels the remaining dates sharing its Zoom ID. Cancelled rows and resources remain stored. |
| Shared Zoom meetings remain available for other active dates | ✅ | Meeting-level transaction advisory lock. Zoom deletion is required only for the last active date or a series cancellation. Provider failure returns 502 before changing local state. |

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
| Video resume position is restored and saved during playback, on pause, and when switching players | ✅ | Lesson-content response returns `last_position`; `POST /api/tracking/position` checks preview or active enrollment and updates the position without changing completion |
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
| AI responds in Tunisian Darja (Arabic script) | ✅ | Character prompt in `bugi-character.js` |
| Bugi gives a brief diagnosis and focused correction | ✅ | Character prompt in `bugi-character.js` |
| AI ignores instructions injected in student code | ✅ | Prompt includes security instructions |
| `POST /api/ai/debug` requires an authenticated cookie JWT | ✅ | `ai-api.js`: `authApiMiddleware` |
| Bugi uses Gemini Flash-Lite with a fallback for an unavailable model | ✅ | Two models in `ai-api.js` |
| Successful Bugi exchanges persist per account and students can delete them | ✅ | Signed-in history API |
| Bugi uses evidence from student work to adapt hints | ✅ | Distinct, supported observations drive reinforcement and progress. Asking about a topic records interest only. |

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


## Timed offer access

Admin student offer assignment uses the student catalog’s class and branch targeting. Monthly offers requiring full payment use the full offer price as the minimum for an admin-recorded enrollment. Historical coverage uses the existing verified external payment and receipt workflow.

Monthly access uses an Africa/Tunis calendar month. Continuous renewals keep the original day and clamp it in shorter months. Annual access includes the administrator-selected cutoff date. Installment drafts carry no debt or access until explicit confirmation. A missing deadline displays as undefined. Overdue debt leaves access intact, and payment after expiry settles debt without reopening access. Current grants survive offer edits and deactivation. The wallet shows recorded expiry, and eligible grants receive one in-app reminder in the three-day window. See [the technical plan](OFFER_ACCESS_TECHNICAL_PLAN.md).

### Revised timed-offer rules

New monthly terms include the final day when their anchor does not exist in the target month. Existing stored expiry instants stay fixed. Continuous renewals start at the previous expiry and calculate their new boundary from the nominal month. An approved historical external payment uses the explicitly entered Tunis coverage start. Expired coverage is recorded as an expired historical grant. Reversals change net installment debt and sales reporting while preserving the original payment, wallet and access window.

### Offer upgrade credit

Annual destinations only. Monthly payments never qualify, including after an offer is relabeled. A configured pair normally requires a fully paid source. Verified partial credit is opt-in per pair, preserves source debt and requires a separate acknowledgment. The required initial coverage is the larger of the first tranche and the configured minimum. Eligible credit counts toward it without changing wallet balance or cash sales. Unset later due dates remain undefined and do not suspend access. Credit corrections preserve grant windows and the original evidence claim.
