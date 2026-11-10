// SQL arguments below are fixed column names or parameter placeholders from route code.
export function offerEntitlement(user, offer, course) {
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
        WHERE legacy.user_id = ${user} AND legacy.offer_id = ${offer}
          ${course ? `AND legacy.course_id = ${course}` : ""}
          AND (legacy.expires_at IS NULL OR legacy.expires_at > NOW())
      )
    )
  )`;
}

export function liveSessionAccess(user) {
  return `ls.status <> 'cancelled'
    AND (ls.audience_student_ids IS NULL OR ${user} = ANY(ls.audience_student_ids))
    AND EXISTS (
      SELECT 1 FROM enrollments e WHERE e.user_id = ${user} AND e.course_id = ls.course_id
        AND (e.expires_at IS NULL OR e.expires_at > NOW())
    )
    AND (ls.offer_id IS NULL OR ${offerEntitlement(user, "ls.offer_id", "ls.course_id")})`;
}

export function matchesOfferTarget(offer, profile) {
  const matches = (targets, value) => !targets?.length || Boolean(
    value && targets.some(target => String(target).trim().toLowerCase() === value.trim().toLowerCase())
  );
  return matches(offer.target_classes, profile?.class) && matches(offer.target_branches, profile?.branch);
}
