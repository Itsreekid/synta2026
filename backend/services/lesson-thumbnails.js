// =====================================================
// LESSON THUMBNAILS
// One JPEG frame per video lesson, captured in the admin page from the
// lesson video and stored in R2 at a fixed key (no database column):
//   lesson-thumbnails/<lessonId>.jpg
// Replacing the video uploads a new frame to the same key; removing the
// video keeps the object (stored files are never deleted on removal) but it
// is no longer served. Students receive short-lived signed URLs only.
// =====================================================
import { generateSignedUrl, readR2ObjectMetadata } from "../utils/r2Utils.js";

export const LESSON_THUMBNAIL_TYPE = "image/jpeg";
export const LESSON_THUMBNAIL_MAX_BYTES = 512 * 1024;
const LESSON_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLessonId(value) {
  return typeof value === "string" && LESSON_ID.test(value);
}

export function lessonThumbnailKey(lessonId) {
  if (!isLessonId(lessonId)) throw new Error("Invalid lesson id");
  return `lesson-thumbnails/${lessonId.toLowerCase()}.jpg`;
}

/** Short-lived URL the admin page reads the lesson video from to capture a frame (direct URLs pass through). */
export async function lessonVideoReadUrl(videoKey) {
  const key = String(videoKey || "").trim();
  if (!key) throw new Error("No lesson video");
  return /^https?:\/\//i.test(key) ? key : generateSignedUrl(key, 900);
}

/** True when a thumbnail exists for the lesson; false when R2 answers 404. Other errors propagate. */
export async function lessonThumbnailExists(lessonId) {
  try {
    await readR2ObjectMetadata(lessonThumbnailKey(lessonId));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") return false;
    throw error;
  }
}
