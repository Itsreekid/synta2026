import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Only load .env file in development (Railway uses environment variables)
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: join(__dirname, ".env") });
  console.log("📋 Loaded .env file (development mode)");
} else {
  console.log("📋 Using Railway environment variables (production mode)");
}
