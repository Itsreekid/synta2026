import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Always try to load .env, but NEVER override variables already set in the environment.
// This means:
//   - In production (Coolify/Railway): env vars injected by the platform take priority.
//     .env values are ignored for any key that's already defined.
//   - In local development: .env provides all values since nothing is pre-set.
// This approach works correctly regardless of NODE_ENV being set or not.
dotenv.config({ path: join(__dirname, ".env"), override: false });

const source = process.env.NODE_ENV === "production" ? "platform (Coolify/Railway)" : "local .env file";
console.log(`📋 Environment loaded — source priority: ${source}`);
