// =====================================================
// DEPLOYMENT DIAGNOSTIC SCRIPT
// Run this to check if your environment is ready for Railway
// =====================================================
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("\n🔍 Railway Deployment Diagnostic\n");
console.log("================================\n");

// Check 1: Node version
console.log("1️⃣  Node.js Version:");
console.log(`   ✓ ${process.version}`);
if (parseInt(process.version.slice(1)) < 18) {
  console.log("   ⚠️  Warning: Node.js 18+ recommended for Railway\n");
} else {
  console.log("   ✓ Compatible with Railway\n");
}

// Check 2: Package.json
console.log("2️⃣  Package Configuration:");
try {
  const pkgPath = join(__dirname, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = await import(pkgPath, { assert: { type: "json" } });
    console.log(`   ✓ package.json found`);
    console.log(`   ✓ Name: ${pkg.default.name}`);
    console.log(`   ✓ Type: ${pkg.default.type || "commonjs"}`);
    console.log(`   ✓ Start script: ${pkg.default.scripts?.start || "NOT SET"}`);
    
    if (pkg.default.type !== "module") {
      console.log("   ⚠️  Warning: type should be 'module' for ES6 imports\n");
    } else {
      console.log("   ✓ ES modules configured correctly\n");
    }
  } else {
    console.log("   ❌ package.json not found!\n");
  }
} catch (error) {
  console.log(`   ❌ Error reading package.json: ${error.message}\n`);
}

// Check 3: Environment Variables
console.log("3️⃣  Environment Variables:");
const requiredVars = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_KEY",
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_ACCESS_KEY",
  "R2_SECRET_KEY",
  "R2_BUCKET",
  "ALLOWED_ORIGINS"
];

let missingCount = 0;
requiredVars.forEach(varName => {
  if (process.env[varName]) {
    const value = process.env[varName];
    const masked = value.length > 20 ? value.substring(0, 20) + "..." : value;
    console.log(`   ✓ ${varName}: ${masked}`);
  } else {
    console.log(`   ❌ ${varName}: NOT SET`);
    missingCount++;
  }
});

if (missingCount === 0) {
  console.log("   ✓ All required environment variables set\n");
} else {
  console.log(`   ⚠️  ${missingCount} variables missing\n`);
}

// Check 4: Port configuration
console.log("4️⃣  Port Configuration:");
const port = process.env.PORT || 3000;
console.log(`   ✓ Will use port: ${port}`);
if (!process.env.PORT) {
  console.log("   ℹ️  Using default port 3000 (Railway will set PORT automatically)\n");
} else {
  console.log("   ✓ PORT variable is set\n");
}

// Check 5: Critical files
console.log("5️⃣  Critical Files:");
const criticalFiles = [
  "server.js",
  "package.json",
  "config/supabase.js",
  "config/r2.js",
  "routes/content.js",
  "routes/courses.js",
  "routes/enrollment.js",
  "middleware/auth.js",
  "utils/r2Utils.js"
];

let missingFiles = 0;
criticalFiles.forEach(file => {
  const fullPath = join(__dirname, file);
  if (existsSync(fullPath)) {
    console.log(`   ✓ ${file}`);
  } else {
    console.log(`   ❌ ${file} - NOT FOUND`);
    missingFiles++;
  }
});

if (missingFiles === 0) {
  console.log("   ✓ All critical files present\n");
} else {
  console.log(`   ⚠️  ${missingFiles} files missing\n`);
}

// Check 6: Dependencies
console.log("6️⃣  Node Modules:");
const modulesPath = join(__dirname, "node_modules");
if (existsSync(modulesPath)) {
  console.log("   ✓ node_modules directory exists");
  
  const criticalDeps = [
    "express",
    "cors",
    "helmet",
    "dotenv",
    "@aws-sdk/client-s3",
    "@supabase/supabase-js"
  ];
  
  criticalDeps.forEach(dep => {
    const depPath = join(modulesPath, dep);
    if (existsSync(depPath)) {
      console.log(`   ✓ ${dep}`);
    } else {
      console.log(`   ❌ ${dep} - NOT INSTALLED`);
    }
  });
} else {
  console.log("   ⚠️  node_modules not found - run 'npm install'\n");
}

console.log("\n================================");
console.log("\n📊 Summary:\n");

if (missingCount === 0 && missingFiles === 0) {
  console.log("✅ Your backend appears ready for Railway deployment!");
  console.log("\nNext steps:");
  console.log("1. Commit and push to GitHub");
  console.log("2. In Railway: Set Root Directory to 'backend'");
  console.log("3. In Railway: Add all environment variables");
  console.log("4. Deploy!");
} else {
  console.log("⚠️  Issues found that need attention:");
  if (missingCount > 0) {
    console.log(`   - ${missingCount} environment variables missing`);
    console.log("     (These must be set in Railway dashboard)");
  }
  if (missingFiles > 0) {
    console.log(`   - ${missingFiles} critical files missing`);
  }
}

console.log("\n");
