// Live-session features that depend on held migrations. Until the owner applies
// them, the existing behavior is kept and the new options stay unavailable.
import { setExtendedLiveAccess, setMultiLiveAccess } from "../utils/offerAccess.js";

export const liveFeatures = { extendedAccess: false, recordingsTable: false, multiAudience: false };

export function recordingImportsEnabled() {
  return liveFeatures.recordingsTable && process.env.ZOOM_RECORDING_IMPORT_ENABLED === "true";
}

export async function detectLiveFeatures(pool) {
  const { rows: [row] } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'live_sessions'
          AND column_name IN ('additional_offer_ids', 'granted_student_ids'))::int AS access_columns,
       to_regclass('zoom_recording_imports') IS NOT NULL AS recordings_table,
       to_regclass('live_session_courses') IS NOT NULL AND to_regclass('live_session_offers') IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
         AND table_name='live_sessions' AND column_name='access_policy') AS multi_audience`
  );
  liveFeatures.extendedAccess = row.access_columns === 2;
  liveFeatures.recordingsTable = Boolean(row.recordings_table);
  setExtendedLiveAccess(liveFeatures.extendedAccess);
  liveFeatures.multiAudience = liveFeatures.extendedAccess && Boolean(row.multi_audience);
  setMultiLiveAccess(liveFeatures.multiAudience);
  return { ...liveFeatures };
}
