### Manual live completion — 2026-11-24

- Admin may mark a started Synta live session completed before its nominal end. This closes new platform joins and permits replay metadata edits immediately, without changing scheduled duration/Zoom identity or publishing unfinished media. Admin must separately end the meeting for all in Zoom. Recording processing/delivery remains event-driven with manual publication.
- Upcoming session title, description and course associations may be edited locally; use the dedicated reschedule action for future time changes. No automatic title conversion or historical access change.

### Upcoming session rescheduling — 2026-11-24

- Admin can reschedule one future, scheduled session to another future date/time in Africa/Tunis. Other sessions sharing the Zoom meeting are unchanged. Affected currently entitled student accounts receive one in-app notification naming the old and new date; overlapping audiences do not duplicate recipients. Retry of the same confirmed date does not notify again.
- Finished/cancelled/in-progress sessions cannot use the reschedule action. Access rights and replay records do not change. External provider failure rolls back local changes and notifications.

### Finished replay administration — 2026-11-24

- Administrators may correct finished manual or Zoom-linked session title, past scheduled date/time, duration, description and associated courses through the existing popup. This changes platform presentation; Zoom occurrence identity and cloud originals remain unchanged. Multi-audience offer and invitation rules remain intact.
- Removing one finished session marks it cancelled locally, removing its student calendar/replay visibility and authorization while preserving storage and recording history. Upcoming/live and whole-series cancellations retain their existing provider confirmation behavior.

# BUSINESS_RULES.md — Synta Academy

> **Last audited:** 2026-11-05  
> **Status legend:**  
> ✅ **IMPLEMENTED** — Verified in source code  
> ⚠️ **PARTIALLY IMPLEMENTED** — Logic exists but incomplete or inconsistent  
> ❌ **NOT IMPLEMENTED** — No code found  
> ❓ **NEEDS CLARIFICATION** — Business decision not documented anywhere

---

## Launch Scope (owner decision, 2026-11-20)

| In scope for the first teaching launch | Deferred (documented, not developed now) |
|---|---|
| Tunisian lycée students with the existing registration | University students and other audience types |
| Admin creates and manages offers containing several courses | WhatsApp integration |
| Courses as chapters, lessons, video replays and quizzes | XP, badges and ranks (hidden) |
| Admin schedules Zoom sessions for eligible students; they appear automatically on the student Dashboard and Calendar | Major architectural redesigns |
| Students access their purchased courses and learning materials | Code Pratique Web mode |
| Clean, fast mobile and desktop student experience; Admin and Student data stay in sync | Remaining learning-progress work (resume next lesson) — paused |

Rules below that belong to deferred areas stay as documented but must not receive development time until the owner lifts the launch freeze.

---

## 1. User Roles

### BR-00: Course Content Reuse

Administrators may add historical replays to one course with the original completed date/time in Africa/Tunis. No Zoom meeting is created. Existing active course access controls apply; historical dates do not grant or extend access. Course catalogue viewers may see only the title/date/duration of course-wide historical replays as locked entries. Offer-specific and individually restricted replay metadata is excluded from this preview; playback and attachments still require authorization. Links or uploaded video and optional resources use existing student playback and resource authorization.

Admin Courses and Offers filters organize existing records by class and branch without modifying student eligibility. Course filters use existing linked-offer targeting (class and branch on the same offer); unlinked courses remain visible and clearly labeled. Default lists include all records and inactive offers. Filters are remembered per page in the same browser tab.

Course descriptions preserve their stored text. Cards show normalized plain text with Markdown syntax removed and a three-line CSS preview; details support safe bold, italic, paragraphs and lists for the complete description. Raw HTML, links and images are not enabled in description Markdown.

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
| Access token lasts 1 hour | ✅ | `services/sessions.js`: `ACCESS_TTL_MS` |
| A signed-in student stays signed in while active: normal sessions renew with a 14-day refresh inactivity window and a 30-day absolute cap (owner decision 2026-11-22; requires refresh-token migration) | ✅ | `services/sessions.js`: `REFRESH_IDLE_MS`, `SESSION_MAX_MS` (2026-11-20, Batch 2B) |
| Refresh token auto-renews access token when it expires, on any page or API request, with no client-side code | ✅ | `sessionRenewal` in `middleware/requireAuth.js`, mounted in `server.js` (2026-11-20). Active only after `database/pending-migrations/202611200001_create_refresh_tokens.sql` is approved and applied; until then sessions last one hour and the 2A expiry handling applies |
| Each refresh token works once. Reusing an old token more than 20 seconds after it was exchanged ends every session from that sign-in | ✅ | `rotateRefreshToken` in `services/sessions.js` |
| Session cookies are HttpOnly, Secure in production and `SameSite=Lax`, so links opened from WhatsApp or email keep the student signed in (owner decision 2026-11-20) | ✅ | `services/sessions.js` `cookieBase()` |
| Refresh tokens issued before Batch 2B are accepted once and converted, so nobody is logged out by the release | ✅ | `rotateRefreshToken` legacy branch |
| Logout clears both cookies and revokes the refresh token on the server | ✅ | `POST /api/auth/logout` → `revokeRefreshToken` |
| Admin "log in as student" sessions never renew; they end after one hour and keep the 5-minute warning | ✅ | `GET /api/auth/magic-login` → `startSession(..., { renewable: false })` |
| An expired or missing session on a student page sends the student to `/login?next=<page>`; after login they return to that page. Only `/dashboard` and `/app/...` destinations are accepted | ✅ | `utils/returnPath.js`, `requireAuth`, `/login`, `auth-entry.js`, `google-auth.js` (2026-11-20) |
| The login page says « Ta session a expiré » when the access token is invalid, or missing while the refresh cookie is still present; otherwise it says « Connecte-toi pour accéder à cette page. ». With Batch 2B this happens only when renewal is refused (expired, revoked or reused refresh token) or unavailable | ✅ | `requireAuth`, `views/pages/auth/login.ejs` |
| While studying, an API 401 opens one « Session expirée » dialog with no automatic navigation. The banner 5 minutes before expiry appears only for sessions that cannot renew | ✅ | `public/js/session-guard.js`, `head.ejs` (`sessionRenewable`) |
| Lesson-progress and quiz-answer saves that fail with 401 are kept in the tab and replayed once after re-login, only for the same student and only within 6 hours | ✅ | `public/js/session-guard.js` |
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
| An expired permanent enrollment does not block re-purchase or free re-enrollment; checkout reactivates the existing row (owner-approved 2026-11-14) | ✅ | `purchase.js` `/course`, `enrollment.js` `/enroll` and `/free-enroll` |

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
| Students cannot change their own class or section; only admins can (owner decision 2026-11-20) | ✅ | `PUT /api/user/me` updates only name and phone; profile selects are read-only |

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
| New OR sessions require at least one selected offer or course. Active access to any selected offer, active enrollment or timed grant to any selected course, or a session invitation permits joining, replay and session resources | ✅ locally, production held | Owner-approved rule; `access_policy='any_selected'`, association tables and shared `liveSessionAccess`. Invitations never create course enrollment. Existing legacy sessions preserve their policy. Creation requires `LIVE_MULTI_AUDIENCE_ENABLED=true` and migration 004 after 002. |
| Students must be enrolled in the course to see its sessions | ✅ | `GET /api/live/upcoming` filters by enrollment |
| Sessions can be restricted to a specific offer | ✅ | `live_sessions.offer_id` filter logic |
| A session can accept several offers: students with an active purchase of the primary offer (with course enrollment) OR of ANY additional offer can join (owner decision 2026-11-20) | ✅ code, ⏳ held migration | `live_sessions.additional_offer_ids`; `liveSessionAccess` in `utils/offerAccess.js`. Additional offers require a primary offer. Expired timed access and refunded purchases lose access. |
| Admin can grant individual students access to one session without any purchase (owner decision 2026-11-20) | ✅ code, ⏳ held migration | `live_sessions.granted_student_ids`; a grant bypasses the offer and audience checks for that session only, including its replay and files |
| Before migration `202611200002` is applied, the access rule is exactly the previous one and the new admin fields are refused (409) | ✅ | Startup column detection (`services/live-features.js`) |
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
| A session stays listed for students until `scheduled_at + duration_minutes` | ✅ | `GET /api/live/upcoming` |
| Students can join from 10 minutes before the start until the scheduled end (owner decision 2026-11-20) | ✅ | `calendar.js` join window uses `duration_minutes` (default 60), and the server enforces the same window |
| Students never receive the Zoom join link in API data; they get `/api/live/:id/join`, which checks access and the window before redirecting (owner decision 2026-11-20) | ✅ | `GET /api/live/:sessionId/join`: 302 to Zoom, otherwise a French notice (404 no access, 403 too early, 410 ended, 401 logged out) |

### BR-19: Automatic Zoom imports, manual replay publication (owner revision 2026-11-24)
| Behavior | Status | Evidence |
|----------|--------|----------|
| Zoom cloud recordings are imported automatically after `recording.completed`: the MP4 itself is copied into private R2, never a Zoom link | ✅ code, ⏳ held migration + env flag | `routes/zoom-webhook.js`, `services/zoom-recordings.js` |
| Each recording segment uses one preferred MP4 view; nothing is merged and Zoom originals are never deleted | ✅ | One `zoom_recording_imports` row per segment |
| Every new segment, including a single matched segment, requires explicit admin publication | ✅ local code; held reliability migration | Worker never changes `replay_url`; legacy published records preserved |
| Several segments (intro stopped/restarted): « À vérifier »; the admin chooses which segment(s) to publish | ✅ | Several published segments appear to students as « Partie 1 », « Partie 2 »… |
| An existing replay is never overwritten automatically; recordings that match no session, or two sessions, wait for the admin | ✅ | Review reasons `admin_approval_required`, `multiple_segments`, `no_matching_session`, `ambiguous_session` |
| After review, the admin can delete unpublished segments from R2 (the Zoom original stays) | ✅ | `DELETE /api/live/admin/recordings/:importId` commits durable intent (202), recovered by the worker; published/referenced segments are refused (409) |
| Replay access follows exactly the live session's access rule | ✅ | Same `liveSessionAccess` SQL; short-lived signed R2 links; the player fetches a fresh link once if one expires |
| Failed transfers retry (1 min, 5 min, 30 min, 2 h, 6 h; 6 tries max) and the admin can press « Réessayer » | ✅ | Interrupted imports resume after a server restart |

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
| A native video lesson completes when its playhead reaches 90% (owner confirmed 2026-11-23) | ✅ | `course-details.js` uses the existing authenticated completion API; confirmed saves update visible/cached course progress. End/manual completion is preserved. Repeated events share one save; failed attempts can retry. |
| XP, levels and badges are hidden until a real rule is defined (owner decision 2026-11-20) | ❌ | Dashboard still shows client-computed XP, level and badges. Roadmap P2-3 |

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
| BQ-05 | Should session replay URLs be automatically set via Zoom webhooks? | ANSWERED 2026-11-20 — yes, see BR-19 |
| BQ-06 | Should students see their `debt` amount in their wallet? | MEDIUM |
| BQ-07 | Should there be an instructor role separate from admin? | MEDIUM |
| BQ-08 | Is the `payments` table (offer-level) still needed, or is `transactions` the canonical ledger? | MEDIUM |
| BQ-09 | Should `user_weak_topics` be auto-populated via a trigger or background job? | MEDIUM |
| BQ-10 | What happens when a student's enrollment expires? Do they lose access immediately? | HIGH |
| BQ-11 | Can a student belong to multiple groups simultaneously? | MEDIUM |
| BQ-12 | Should live sessions be shareable across multiple offers/groups? | ANSWERED 2026-11-20 — multiple offers and individual grants, see BR-17 (groups remain TASK-013) |


## Timed offer access

For admin-recorded historical installment payments, receipt reference and image are optional. When the reference is omitted, the system records a unique internal reference tied to the request. Actual payment date, confirmed coverage start for backdating, and admin verification still apply.

Admin student offer assignment uses the student catalog’s class and branch targeting. Monthly offers requiring full payment use the full offer price as the minimum for an admin-recorded enrollment. Historical coverage uses the existing verified external payment and receipt workflow.

Monthly access uses an Africa/Tunis calendar month. Continuous renewals keep the original day and clamp it in shorter months. Annual access includes the administrator-selected cutoff date. Installment drafts carry no debt or access until explicit confirmation. A missing deadline displays as undefined. Overdue debt leaves access intact, and payment after expiry settles debt without reopening access. Current grants survive offer edits and deactivation. The wallet shows recorded expiry, and eligible grants receive one in-app reminder in the three-day window. See [the technical plan](OFFER_ACCESS_TECHNICAL_PLAN.md).

### Revised timed-offer rules

New monthly terms include the final day when their anchor does not exist in the target month. Existing stored expiry instants stay fixed. Continuous renewals start at the previous expiry and calculate their new boundary from the nominal month. An approved historical external payment uses the explicitly entered Tunis coverage start. Expired coverage is recorded as an expired historical grant. Reversals change net installment debt and sales reporting while preserving the original payment, wallet and access window.

### Offer upgrade credit

Annual destinations only. Monthly payments never qualify, including after an offer is relabeled. A configured pair normally requires a fully paid source. Verified partial credit is opt-in per pair, preserves source debt and requires a separate acknowledgment. The required initial coverage is the larger of the first tranche and the configured minimum. Eligible credit counts toward it without changing wallet balance or cash sales. Unset later due dates remain undefined and do not suspend access. Credit corrections preserve grant windows and the original evidence claim.

Admin course duplication opens a prefilled, unpublished new-course form for review before saving. It copies settings and offer associations, not chapters, purchases, enrollments or student progress. Chapters may be reused through the existing chapter manager. Offer pickers show class/branch alongside price/status to distinguish identical titles.

### Educational player and lesson checkpoints (2026-11-23)

Uploaded video playback uses Video.js 10.6.0 library controls while preserving native media and existing authorization. Small screens hide extra volume/casting controls, expose touch seeking and request landscape only during supported fullscreen; unsupported browsers retain native behavior with no forced page rotation. Captions are offered only when source tracks exist. Explicit lesson/replay selection attempts autoplay with a Play fallback; next lessons after a quiz/completion start paused. Linked quizzes remain manually available and open on native video end. Correct quiz answers advance after brief feedback; incorrect answers retain their correction until Continue. Provider embeds retain provider controls and manual quiz entry. Replay positions are saved locally by profile/session/segment; lesson positions retain existing server persistence.

### Zoom recording reliability safeguards (2026-11-24, local implementation)

Occurrence UUID bindings preserve existing session associations. Ambiguous occurrences require explicit admin association; conflicting legacy associations are retained for investigation. Publication cannot mix occurrences or include pending transfers/deletions. Each worker owns a unique fenced claim and private object key. Historical recovery is explicit, exact-UUID and selected-file only, never a bulk import. Feature disablement prevents intake, retries and worker claims; existing published playback remains available. See ZOOM_RECORDING_IMPLEMENTATION.md for held migration and activation requirements.

### Event-driven recovery and Corbeille revision — 2026-11-24

- recording.completed remains the primary automatic trigger. No Zoom polling, scheduled recording scan or automatic historical import was added. The periodic worker processes local import/deletion queues only; download metadata refresh is bounded by the existing six import attempts.
- Rechercher sur Zoom now searches on demand by selected Synta session, reuses known exact UUIDs, or calls Zoom past instances when unknown. Multiple occurrences require admin selection. No binding or import is committed by discovery alone. Missing webhooks before deployment are supported when Zoom still exposes that session's meeting history/recordings.
- Search responses show safe MP4 timestamps, duration, size, import status and deleted status. Importer queues selected missing segments through the existing fenced queue. Actualiser reads local APIs only. Requests are coalesced/cached briefly, UI prevents concurrent searches and Zoom Retry-After is honored. Réessayer still targets one failed import.
- Corbeille now soft-deletes, excludes segments from the normal list and prevents discovery/webhooks from restoring them. A separate held migration 202611240002_recording_trash_retention.sql follows 003 and 202611240001. It guarantees at least 48 hours before purge (including unfinished preexisting intents from migration time), stores restore metadata and append-only deletion events, and adds a database minimum-retention constraint. Restoring uses the same stored object, never republishes or re-downloads it. Purge attempts are bounded at six; failure keeps the object for admin intervention. Already physically purged files are not restorable.
- Added admin trash list/restore APIs, authorization checks, mocked discovery/instance/rate-limit tests, minimum-retention/duplicate/restore/purge tests and 360/390/1440 browser checks, including Actualiser causing no Zoom requests. Latest results: see ZOOM_RECORDING_IMPLEMENTATION.md. No production migration, deployment, live Zoom/R2 call or credential change.
