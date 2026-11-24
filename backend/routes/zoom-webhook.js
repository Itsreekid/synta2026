// =====================================================
// ZOOM WEBHOOK — POST /api/zoom/webhook
// Authenticated by Zoom's HMAC signature (ZOOM_WEBHOOK_SECRET_TOKEN), not by
// a user session. Must be mounted before express.json() to keep the raw body.
// =====================================================
import express from "express";
import pool from "../config/db.js";
import { queueRecordingEvent, urlValidationResponse, verifyZoomSignature } from "../services/zoom-recordings.js";
import { recordingImportsEnabled } from "../services/live-features.js";
import { recordingWorker } from "../services/recording-worker.js";
import { recordingLog } from '../services/recording-jobs.js';

const router = express.Router();

router.post("/api/zoom/webhook", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secret) return res.status(503).json({ error: "Webhook not configured" });

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  const timestamp = req.get("x-zm-request-timestamp");
  const signature = req.get("x-zm-signature");
  const signed = verifyZoomSignature(secret, timestamp, rawBody, signature);

  let event;
  try {
    recordingLog('webhook_received', { type:'recording.completed' });
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid payload" });
  }

  if (event?.event === "endpoint.url_validation") {
    if (signature && !signed) return res.status(401).json({ error: "Invalid signature" });
    const answer = urlValidationResponse(secret, event.payload?.plainToken);
    return answer ? res.json(answer) : res.status(400).json({ error: "Invalid validation token" });
  }

  if (!signed) return res.status(401).json({ error: "Invalid signature" });
  if (event?.event !== "recording.completed") return res.json({ received: true });
  // A non-2xx answer makes Zoom retry delivery later.
  if (!recordingImportsEnabled()) return res.status(503).json({ error: "Recording import disabled" });

  try {
    const result = await queueRecordingEvent(pool, event.payload);
    if (result.queued) recordingWorker.kick();
    res.json({ received: true });
  } catch (error) {
    console.error("[Recordings] Could not queue Zoom event:", error.code ?? error.name);
    res.status(500).json({ error: "Could not queue recording" });
  }
});

export default router;
