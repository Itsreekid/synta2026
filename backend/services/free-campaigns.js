export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const RESERVED_SLUGS = new Set(['admin','api','login','verify','status','questions','submit','register']);
export const CAMPAIGN_COLUMNS = `id, slug, title, description, subject, target_class, target_branch,
  scheduled_at, duration_minutes, is_active, is_default, created_at, updated_at`;

export async function slugAliasesReady(db) {
  return (await db.query("SELECT to_regclass('free_session_slug_aliases') IS NOT NULL AS ready")).rows[0].ready;
}

export async function campaignPublicPolicy(db, campaignId) {
  const row = (await db.query(`SELECT to_jsonb(f) ? 'published_occurrence_id' AS ready,
    to_jsonb(f)->>'published_occurrence_id' AS published_occurrence_id,
    to_jsonb(f)->'target_branches' AS target_branches FROM free_sessions f WHERE id=$1`, [campaignId])).rows[0];
  return row || { ready: false, published_occurrence_id: null, target_branches: null };
}

export async function publishedCampaignOccurrence(db, campaignId) {
  const policy = await campaignPublicPolicy(db, campaignId);
  if (!policy.published_occurrence_id) return null;
  return (await db.query(`SELECT id,title,scheduled_at,duration_minutes,status FROM live_sessions
    WHERE id=$1 AND free_session_id=$2 AND status='scheduled' AND scheduled_at>now()`,
  [policy.published_occurrence_id, campaignId])).rows[0] || null;
}

/** Resolve canonical and historical links to the same active campaign, never another URL. */
export async function findActiveCampaign(db, slug) {
  if (slug == null || slug === '') {
    return (await db.query(`SELECT ${CAMPAIGN_COLUMNS} FROM free_sessions WHERE is_default AND is_active`)).rows[0] || null;
  }
  if (typeof slug !== 'string' || slug.length < 2 || slug.length > 60 || !SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) return null;
  const direct = await db.query(`SELECT ${CAMPAIGN_COLUMNS} FROM free_sessions WHERE slug = $1 AND is_active`, [slug]);
  if (direct.rows[0]) return direct.rows[0];
  if (!await slugAliasesReady(db)) return null;
  return (await db.query(`SELECT ${CAMPAIGN_COLUMNS.split(',').map(column => 'f.' + column.trim()).join(',')}
    FROM free_session_slug_aliases a JOIN free_sessions f ON f.id=a.free_session_id
    WHERE a.slug=$1 AND f.is_active`, [slug])).rows[0] || null;
}
