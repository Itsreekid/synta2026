// SQL arguments below are fixed column names or parameter placeholders from route code.
export function legacyOfferEntitlement(user, offer, course) {
  return `(
    EXISTS (
      SELECT 1 FROM payments p
      WHERE p.user_id = ${user} AND p.offer_id = ${offer}
        AND p.status IN ('wallet_completed', 'admin_authorized')
    ) OR (
      NOT EXISTS (
        SELECT 1 FROM payments revoked
        WHERE revoked.user_id = ${user} AND revoked.offer_id = ${offer}
          AND revoked.status IN ('refunded', 'cancelled', 'canceled', 'expired')
      )
      AND EXISTS (
        SELECT 1 FROM enrollments legacy
        WHERE legacy.user_id = ${user} AND legacy.offer_id = ${offer} AND NOT legacy.timed_access_only
          ${course ? `AND legacy.course_id = ${course}` : ""}
          AND (legacy.expires_at IS NULL OR legacy.expires_at > NOW())
      )
    )
  )`;
}

export function timedCourseGrant(user, course, offer = null) {
  return `EXISTS (
    SELECT 1 FROM offer_access_grants g
    ${course ? "JOIN offer_access_grant_courses gc ON gc.grant_id = g.id" : ""}
    WHERE g.user_id = ${user} AND g.revoked_at IS NULL
      AND g.starts_at <= NOW() AND g.expires_at > NOW()
      ${offer ? `AND g.offer_id = ${offer}` : ""}
      ${course ? `AND gc.course_id = ${course}` : ""}
  )`;
}

export function offerEntitlement(user, offer, course) {
  return `(${legacyOfferEntitlement(user, offer, course)} OR ${timedCourseGrant(user, course, offer)})`;
}

export function enrollmentAccess(alias) {
  return `((NOT ${alias}.timed_access_only AND
    (${alias}.expires_at IS NULL OR ${alias}.expires_at > NOW()))
    OR ${timedCourseGrant(alias + ".user_id", alias + ".course_id")})`;
}

let extendedLiveAccess = false;
let multiLiveAccess = false;

export function setMultiLiveAccess(enabled) { multiLiveAccess = Boolean(enabled); }
export function sessionCourseMatch(course) {
  return multiLiveAccess ? `(ls.course_id = ${course} OR EXISTS (
    SELECT 1 FROM live_session_courses sc WHERE sc.session_id=ls.id AND sc.course_id=${course}
  ))` : `ls.course_id = ${course}`;
}

/** Enabled at startup only when live_sessions has additional_offer_ids and granted_student_ids. */
export function setExtendedLiveAccess(enabled) {
  extendedLiveAccess = Boolean(enabled);
}

export function hasExtendedLiveAccess() {
  return extendedLiveAccess;
}

// Paid access to any course of the offer, without requiring the session's course.
export function activeOfferAccess(user, offer) {
  return `(${timedCourseGrant(user, null, offer)} OR (
    ${legacyOfferEntitlement(user, offer, null)}
    AND EXISTS (
      SELECT 1 FROM offer_courses oc
      JOIN enrollments oe ON oe.course_id = oc.course_id AND oe.user_id = ${user}
      WHERE oc.offer_id = ${offer} AND NOT oe.timed_access_only
        AND (oe.expires_at IS NULL OR oe.expires_at > NOW())
    )
  ))`;
}

let freeSessionAccess = false;

/** Enabled at startup only when the free-session campaign migration (202611250002) is applied. */
export function setFreeSessionAccess(enabled) { freeSessionAccess = Boolean(enabled); }
export function hasFreeSessionAccess() { return freeSessionAccess; }

/** Campaign Zoom sessions: only students who completed that campaign's quiz may see and join them. */
function freeSessionParticipantAccess(user) {
  return `(ls.status <> 'cancelled' AND ls.free_session_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM free_session_participants fp
    WHERE fp.free_session_id = ls.free_session_id AND fp.user_id = ${user}
  ))`;
}

export function liveSessionAccess(user) {
  const standard = standardLiveSessionAccess(user);
  return freeSessionAccess ? `(${freeSessionParticipantAccess(user)} OR (${standard}))` : standard;
}

function standardLiveSessionAccess(user) {
  if (multiLiveAccess) {
    return `ls.status <> 'cancelled' AND (
      (ls.access_policy='legacy' AND ${legacyLiveSessionAccess(user)}) OR
      (ls.access_policy='any_selected' AND (
        ${user}=ANY(COALESCE(ls.granted_student_ids,'{}'::uuid[]))
        OR EXISTS (SELECT 1 FROM live_session_offers so WHERE so.session_id=ls.id AND ${offerEntitlement(user, 'so.offer_id')})
        OR EXISTS (SELECT 1 FROM live_session_courses sc JOIN enrollments e ON e.course_id=sc.course_id
          WHERE sc.session_id=ls.id AND e.user_id=${user} AND ${enrollmentAccess('e')})
        OR EXISTS (SELECT 1 FROM live_session_courses sc WHERE sc.session_id=ls.id AND ${timedCourseGrant(user, 'sc.course_id')})
      ))
    )`;
  }
  return legacyLiveSessionAccess(user);
}

function legacyLiveSessionAccess(user) {
  const audience = `(ls.audience_student_ids IS NULL OR ${user} = ANY(ls.audience_student_ids))`;
  // Any paid offer granting this same course qualifies; the session audience still applies.
  const courseAndPrimaryOffer = `EXISTS (
      SELECT 1 FROM enrollments e WHERE e.user_id = ${user} AND e.course_id = ls.course_id
        AND ${enrollmentAccess("e")}
    )
    AND (ls.offer_id IS NULL OR ${offerEntitlement(user, "ls.offer_id", "ls.course_id")}
      OR EXISTS (
        SELECT 1 FROM offer_courses shared_course_offer
        WHERE shared_course_offer.course_id=ls.course_id
          AND ${offerEntitlement(user, "shared_course_offer.offer_id", "ls.course_id")}
      ))`;
  if (!extendedLiveAccess) {
    return `ls.status <> 'cancelled'
    AND ${audience}
    AND (${courseAndPrimaryOffer} OR ${timedCourseGrant(user, "ls.course_id")})`;
  }
  return `ls.status <> 'cancelled' AND (
    ${user} = ANY(COALESCE(ls.granted_student_ids, '{}'::uuid[]))
    OR (${audience} AND (
      (${courseAndPrimaryOffer} OR ${timedCourseGrant(user, "ls.course_id")})
      OR EXISTS (
        SELECT 1 FROM unnest(COALESCE(ls.additional_offer_ids, '{}'::uuid[])) AS extra(offer_id)
        WHERE ${activeOfferAccess(user, "extra.offer_id")}
      )
    ))
  )`;
}

export function matchesOfferTarget(offer, profile) {
  const matches = (targets, value) => !targets?.length || Boolean(
    value && targets.some(target => String(target).trim().toLowerCase() === value.trim().toLowerCase())
  );
  return matches(offer.target_classes, profile?.class) && matches(offer.target_branches, profile?.branch);
}
