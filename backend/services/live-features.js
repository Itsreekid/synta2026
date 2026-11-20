// Live-session features that depend on held migrations. Until the owner applies
// them, the existing behavior is kept and the new options stay unavailable.
import { setExtendedLiveAccess } from "../utils/offerAccess.js";

export const liveFeatures = { extendedAccess: false, recordingsTable: false };

export function recordingImportsEnabled() {
  return liveFeatures.recordingsTable && process.env.ZOOM_RECORDING_IMPORT_ENABLED === "true";
}

export async function detectLiveFeatures(pool) {
  const { rows: [row] } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'live_sessions'
          AND column_name IN ('additional_offer_ids', 'granted_student_ids'))::int AS access_columns,
       to_regclass('zoom_recording_imports') IS NOT NULL AS recordings_table`
  );
  liveFeatures.extendedAccess = row.access_columns === 2;
  liveFeatures.recordingsTable = Boolean(row.recordings_table);
  setExtendedLiveAccess(liveFeatures.extendedAccess);
  return { ...liveFeatures };
}
