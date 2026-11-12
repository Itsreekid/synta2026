export async function sendOfferExpiryReminders(db) {
  return db.query(`INSERT INTO notifications(user_id,title,message,type,link,offer_access_grant_id)
    SELECT g.user_id,'Ton accès à « '||o.title||' » expire bientôt',
      'Ton accès se termine le '||to_char(g.expires_at AT TIME ZONE 'Africa/Tunis','DD/MM/YYYY à HH24:MI')||
      ', heure de Tunis. Ta progression est sauvegardée. Consulte les offres disponibles pour continuer à étudier.',
      'info','/app/offers',g.id
    FROM offer_access_grants g JOIN offers o ON o.id=g.offer_id
    WHERE g.revoked_at IS NULL AND g.starts_at<=NOW() AND g.expires_at>NOW()
      AND g.expires_at<=NOW()+INTERVAL '72 hours'
      AND NOT EXISTS (SELECT 1 FROM offer_access_grants queued WHERE queued.user_id=g.user_id
        AND queued.offer_id=g.offer_id AND queued.revoked_at IS NULL AND queued.starts_at=g.expires_at)
    ON CONFLICT(offer_access_grant_id) WHERE offer_access_grant_id IS NOT NULL DO NOTHING`);
}
