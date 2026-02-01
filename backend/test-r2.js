// =====================================================
// R2 CONNECTION TEST SCRIPT
// Run this to verify your R2 setup is working
// =====================================================
// IMPORTANT: Load environment variables FIRST
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, ".env") });

// Now import R2 utilities (they need env vars to be loaded)
import { validateR2Connection, generateSignedUrl } from "./utils/r2Utils.js";
import { r2Client, R2_BUCKET } from "./config/r2.js";

console.log(`
╔═══════════════════════════════════════════════════╗
║    🧪 CLOUDFLARE R2 CONNECTION TEST              ║
╚═══════════════════════════════════════════════════╝
`);

async function testR2Setup() {
  let allTestsPassed = true;

  // Test 1: Environment Variables
  console.log("📋 Test 1: Checking environment variables...");
  const requiredVars = [
    "CLOUDFLARE_ACCOUNT_ID",
    "R2_ACCESS_KEY",
    "R2_SECRET_KEY",
    "R2_BUCKET",
  ];

  requiredVars.forEach((varName) => {
    if (process.env[varName]) {
      console.log(`   ✅ ${varName}: Set`);
    } else {
      console.log(`   ❌ ${varName}: MISSING`);
      allTestsPassed = false;
    }
  });

  if (!allTestsPassed) {
    console.log("\n❌ Environment variables missing. Please check your .env file.");
    process.exit(1);
  }

  console.log("\n📡 Test 2: Testing R2 connection...");
  const isConnected = await validateR2Connection();

  if (!isConnected) {
    console.log("\n❌ R2 connection failed. Check your credentials and bucket name.");
    console.log("   Troubleshooting:");
    console.log("   1. Verify CLOUDFLARE_ACCOUNT_ID is correct");
    console.log("   2. Verify R2_ACCESS_KEY and R2_SECRET_KEY are valid");
    console.log("   3. Verify bucket 'synta-content' exists in your R2 dashboard");
    console.log("   4. Verify API token has 'Object Read & Write' permissions");
    process.exit(1);
  }

  console.log("\n🔗 Test 3: Testing signed URL generation...");
  try {
    // Generate a test signed URL (even if object doesn't exist)
    const testKey = "test/sample-video.mp4";
    const signedUrl = await generateSignedUrl(testKey, 300);

    console.log(`   ✅ Signed URL generated successfully`);
    console.log(`   📎 Test URL (expires in 5 min):`);
    console.log(`      ${signedUrl.substring(0, 80)}...`);
  } catch (error) {
    console.log(`   ❌ Failed to generate signed URL: ${error.message}`);
    allTestsPassed = false;
  }

  // Summary
  console.log(`
╔═══════════════════════════════════════════════════╗
║    ${allTestsPassed ? "✅ ALL TESTS PASSED" : "❌ SOME TESTS FAILED"}                        ║
╚═══════════════════════════════════════════════════╝
  `);

  if (allTestsPassed) {
    console.log("🎉 Your R2 setup is ready for production!\n");
    console.log("Next steps:");
    console.log("1. Upload test content to R2");
    console.log("2. Add content keys to your database");
    console.log("3. Start your backend server: npm start\n");
  } else {
    console.log("❌ Please fix the errors above before proceeding.\n");
    process.exit(1);
  }
}

// Run tests
testR2Setup().catch((error) => {
  console.error("\n💥 Unexpected error:", error);
  process.exit(1);
});
