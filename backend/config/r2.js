// =====================================================
// CLOUDFLARE R2 CLIENT CONFIGURATION
// Production-ready S3-compatible client for Cloudflare R2
// =====================================================
import { S3Client } from "@aws-sdk/client-s3";

// =====================================================
// ENVIRONMENT VALIDATION (Deferred)
// =====================================================
const REQUIRED_ENV_VARS = [
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_ACCESS_KEY",
  "R2_SECRET_KEY",
  "R2_BUCKET",
];

/**
 * Validate environment variables
 * Called explicitly when needed, not at import time
 */
function validateEnvironment() {
  REQUIRED_ENV_VARS.forEach((envVar) => {
    if (!process.env[envVar]) {
      throw new Error(
        `❌ CRITICAL: Missing required environment variable: ${envVar}\n` +
        `Please check your .env file and ensure all R2 credentials are configured.`
      );
    }
  });

  // Additional validation for account ID format
  if (!/^[a-f0-9]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID)) {
    console.warn(
      `⚠️  WARNING: CLOUDFLARE_ACCOUNT_ID format may be incorrect. ` +
      `Expected 32-character hex string.`
    );
  }
}

// =====================================================
// R2 CLIENT INITIALIZATION (Lazy)
// =====================================================
let _r2Client = null;

/**
 * Get or create R2 client instance
 * Lazy initialization ensures env vars are loaded first
 */
function getR2Client() {
  if (!_r2Client) {
    // Validate on first use
    validateEnvironment();
    
    _r2Client = new S3Client({
      region: "auto", // R2 requires "auto" region (not a real AWS region)
      endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY,
        secretAccessKey: process.env.R2_SECRET_KEY,
      },
      // Optional: Force path-style URLs (more compatible)
      forcePathStyle: true,
    });

    // Log successful initialization (development only)
    if (process.env.NODE_ENV === "development") {
      console.log("✅ R2 Client initialized successfully");
      console.log(`   Bucket: ${process.env.R2_BUCKET}`);
      console.log(`   Endpoint: https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`);
      console.log(`   Default URL Expiry: ${SIGNED_URL_EXPIRY}s`);
    }
  }
  return _r2Client;
}

/**
 * Cloudflare R2 Client (S3-compatible)
 * 
 * SECURITY NOTES:
 * - Credentials are read from environment variables only
 * - Never expose this client to frontend code
 * - Region is always "auto" for R2
 * - Endpoint format: https://{account-id}.r2.cloudflarestorage.com
 */
export const r2Client = new Proxy({}, {
  get(target, prop) {
    return getR2Client()[prop];
  }
});

// =====================================================
// CONFIGURATION CONSTANTS
// =====================================================
/**
 * R2 Bucket name for content storage
 * @type {string}
 */
export function getR2Bucket() {
  if (!process.env.R2_BUCKET) {
    throw new Error("R2_BUCKET environment variable not set");
  }
  return process.env.R2_BUCKET;
}

export const R2_BUCKET = process.env.R2_BUCKET || "synta-content";

/**
 * Default signed URL expiry time in seconds
 * @type {number}
 * @default 300 (5 minutes)
 */
export const SIGNED_URL_EXPIRY = parseInt(process.env.SIGNED_URL_EXPIRY) || 300;
