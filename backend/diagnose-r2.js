// =====================================================
// CLOUDFLARE R2 DIAGNOSTIC TOOL
// =====================================================
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, ".env") });

import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";

console.log(`
╔═══════════════════════════════════════════════════╗
║    🔍 R2 CREDENTIALS DIAGNOSTIC                  ║
╚═══════════════════════════════════════════════════╝
`);

// Show what we're using (masked for security)
console.log("📋 Configuration:");
console.log(`   Account ID: ${process.env.CLOUDFLARE_ACCOUNT_ID}`);
console.log(`   Access Key: ${process.env.R2_ACCESS_KEY?.substring(0, 8)}...`);
console.log(`   Secret Key: ${process.env.R2_SECRET_KEY?.substring(0, 8)}...`);
console.log(`   Bucket: ${process.env.R2_BUCKET}`);
console.log(`   Endpoint: https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com\n`);

// Test 1: Try to create client
console.log("🧪 Test 1: Creating R2 client...");
try {
  const r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY,
      secretAccessKey: process.env.R2_SECRET_KEY,
    },
  });
  console.log("   ✅ R2 client created\n");

  // Test 2: List buckets
  console.log("🧪 Test 2: Listing buckets (verifying credentials)...");
  const command = new ListBucketsCommand({});
  const response = await r2Client.send(command);
  
  console.log("   ✅ Credentials are valid!\n");
  console.log("📦 Your R2 Buckets:");
  if (response.Buckets && response.Buckets.length > 0) {
    response.Buckets.forEach(bucket => {
      const isTarget = bucket.Name === process.env.R2_BUCKET;
      console.log(`   ${isTarget ? '✅' : '  '} ${bucket.Name} ${isTarget ? '(CONFIGURED)' : ''}`);
    });

    const bucketExists = response.Buckets.some(b => b.Name === process.env.R2_BUCKET);
    if (!bucketExists) {
      console.log(`\n⚠️  WARNING: Bucket '${process.env.R2_BUCKET}' not found!`);
      console.log(`   Please create it in Cloudflare Dashboard → R2 → Create bucket\n`);
    } else {
      console.log(`\n✅ SUCCESS! Everything is configured correctly!\n`);
    }
  } else {
    console.log("   ⚠️  No buckets found. Create 'synta-content' in Cloudflare R2 dashboard\n");
  }

} catch (error) {
  console.log(`   ❌ Failed: ${error.message}\n`);
  console.log("💡 Troubleshooting:");
  console.log("   1. Go to Cloudflare Dashboard → R2");
  console.log("   2. Click 'Manage R2 API Tokens'");
  console.log("   3. Verify your token has these permissions:");
  console.log("      • Admin Read & Write (or Object Read & Write)");
  console.log("   4. If token is wrong, create a new one and update .env");
  console.log("   5. Make sure you copied the FULL Secret Access Key\n");
  console.log(`Full error: ${error.stack}\n`);
}
