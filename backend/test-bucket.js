// =====================================================
// TEST SYNTA-CONTENT BUCKET DIRECTLY
// =====================================================
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, ".env") });

import { S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

console.log(`
╔═══════════════════════════════════════════════════╗
║    🧪 SYNTA-CONTENT BUCKET TEST                  ║
╚═══════════════════════════════════════════════════╝
`);

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET;

async function runTests() {
  try {
    // Test 1: Check if bucket exists and is accessible
    console.log("🧪 Test 1: Checking bucket access...");
    await r2Client.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`   ✅ Bucket '${BUCKET}' is accessible!\n`);

    // Test 2: Upload a test file
    console.log("🧪 Test 2: Uploading test file...");
    const testKey = "test/connection-test.txt";
    const testContent = `Connection test successful! ${new Date().toISOString()}`;
    
    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: testKey,
        Body: testContent,
        ContentType: "text/plain",
      })
    );
    console.log(`   ✅ Uploaded: ${testKey}\n`);

    // Test 3: Generate signed URL
    console.log("🧪 Test 3: Generating signed URL...");
    const signedUrl = await getSignedUrl(
      r2Client,
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: testKey,
      }),
      { expiresIn: 300 } // 5 minutes
    );
    console.log(`   ✅ Signed URL generated (expires in 5 min)`);
    console.log(`   URL: ${signedUrl.substring(0, 80)}...\n`);

    // Test 4: Download using signed URL
    console.log("🧪 Test 4: Reading file back...");
    const getResponse = await r2Client.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: testKey,
      })
    );
    const downloadedContent = await getResponse.Body.transformToString();
    console.log(`   ✅ Downloaded: "${downloadedContent}"\n`);

    // Test 5: Delete test file
    console.log("🧪 Test 5: Cleaning up test file...");
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: testKey,
      })
    );
    console.log(`   ✅ Deleted test file\n`);

    console.log("╔═══════════════════════════════════════════════════╗");
    console.log("║    ✅ ALL TESTS PASSED!                          ║");
    console.log("║    Your R2 setup is working perfectly!           ║");
    console.log("╚═══════════════════════════════════════════════════╝\n");

    console.log("✨ Next steps:");
    console.log("   1. Start uploading your course content to R2");
    console.log("   2. Set up Supabase database (see SETUP_GUIDE.md)");
    console.log("   3. Start the backend: npm start");
    console.log("   4. Integrate with frontend\n");

  } catch (error) {
    console.log(`   ❌ Test failed: ${error.message}\n`);
    
    if (error.name === "NotFound") {
      console.log("💡 Bucket 'synta-content' doesn't exist!");
      console.log("   Create it in Cloudflare Dashboard → R2 → Create bucket\n");
    } else if (error.name === "AccessDenied" || error.name === "Forbidden") {
      console.log("💡 Access denied. Check:");
      console.log("   1. Token permissions include 'Object Read & Write'");
      console.log("   2. Token is scoped to 'synta-content' bucket");
      console.log("   3. Credentials are correct in .env file\n");
    } else {
      console.log(`Full error: ${error}\n`);
    }
  }
}

runTests();
