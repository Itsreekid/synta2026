// =====================================================
// R2 UTILITY FUNCTIONS
// Production-ready helpers for Cloudflare R2 operations
// =====================================================
import { 
  GetObjectCommand, 
  PutObjectCommand, 
  DeleteObjectCommand, 
  HeadObjectCommand,
  ListObjectsV2Command 
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET, SIGNED_URL_EXPIRY } from "../config/r2.js";

// =====================================================
// SIGNED URL GENERATION (Core Security Feature)
// =====================================================
/**
 * Generate a temporary signed URL for secure content access
 * 
 * SECURITY:
 * - URL expires after specified time (default 5 minutes)
 * - No public access to bucket required
 * - Each request gets a unique URL
 * - Cannot be shared effectively (expires quickly)
 * 
 * @param {string} key - R2 object key (e.g., 'courses/bac-info/module1/video.mp4')
 * @param {number} [expiresIn=SIGNED_URL_EXPIRY] - URL expiry time in seconds
 * @returns {Promise<string>} - Temporary signed URL
 * @throws {Error} If key is invalid or R2 operation fails
 * 
 * @example
 * const url = await generateSignedUrl('courses/python/lesson1/video.mp4', 300);
 * // URL valid for 5 minutes
 */
export async function generateSignedUrl(key, expiresIn = SIGNED_URL_EXPIRY) {
  // Input validation
  if (!key || typeof key !== "string") {
    throw new Error("Invalid R2 key: must be a non-empty string");
  }

  if (expiresIn < 60 || expiresIn > 3600) {
    throw new Error("Expiry time must be between 60 and 3600 seconds (1-60 minutes)");
  }

  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });

    const signedUrl = await getSignedUrl(r2Client, command, {
      expiresIn,
    });

    // Log for debugging (development only)
    if (process.env.NODE_ENV === "development") {
      console.log(`🔗 Generated signed URL for: ${key} (expires in ${expiresIn}s)`);
    }

    return signedUrl;
  } catch (error) {
    console.error("❌ Error generating signed URL:", error.message);
    throw new Error(`Failed to generate signed URL for ${key}: ${error.message}`);
  }
}

/**
 * Upload a file to R2
 * @param {string} key - R2 object key
 * @param {Buffer} fileBuffer - File content
 * @param {string} contentType - MIME type
 * @returns {Promise<void>}
 */
export async function uploadToR2(key, fileBuffer, contentType) {
  try {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await r2Client.send(command);
    console.log(`File uploaded successfully: ${key}`);
  } catch (error) {
    console.error("Error uploading to R2:", error);
    throw new Error("Failed to upload file");
  }
}

/**
 * Delete a file from R2
 * @param {string} key - R2 object key
 * @returns {Promise<void>}
 */
export async function deleteFromR2(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });

    await r2Client.send(command);
    console.log(`File deleted successfully: ${key}`);
  } catch (error) {
    console.error("Error deleting from R2:", error);
    throw new Error("Failed to delete file");
  }
}

/**
 * Generate a structured R2 key for content
 * @param {string} courseId - Course UUID
 * @param {string} moduleId - Module UUID
 * @param {string} lessonId - Lesson UUID
 * @param {string} fileName - Original file name
 * @returns {string} - Formatted R2 key
 */
export function generateR2Key(courseId, moduleId, lessonId, fileName) {
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `courses/${courseId}/${moduleId}/${lessonId}/${sanitizedFileName}`;
}

// =====================================================
// CONNECTION VALIDATION
// =====================================================
/**
 * Verify R2 connectivity and credentials
 * Useful for health checks and startup validation
 * 
 * @returns {Promise<boolean>} - True if connection is valid
 */
export async function validateR2Connection() {
  try {
    // Try to list objects in bucket (lightweight operation)
    const command = new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      MaxKeys: 1, // Only need 1 to verify access
    });

    await r2Client.send(command);
    
    console.log("✅ R2 connection validated successfully");
    console.log(`   Bucket: ${R2_BUCKET}`);
    return true;
  } catch (error) {
    console.error("❌ R2 connection validation failed:", error.message);
    console.error("   Please check your R2 credentials and bucket name");
    return false;
  }
}
