import { normalizeTunisianPhone, validateLearnerProfile } from '../utils/learnerProfile.js';

/** Shared by ordinary Google onboarding and campaign onboarding; callers supply verified identity. */
export async function saveLearnerProfile(db, userId, { phone, userClass, userBranch }) {
  const error = validateLearnerProfile({ phone, userClass, userBranch });
  if (error) throw Object.assign(new Error(error), { status: 400 });
  const result = await db.query(`UPDATE users SET phone=$1,class=$2,branch=$3,updated_at=NOW()
    WHERE id=$4 RETURNING id`, [normalizeTunisianPhone(phone), userClass, userBranch, userId]);
  if (!result.rowCount) throw Object.assign(new Error('Compte introuvable.'), { status: 404 });
}
