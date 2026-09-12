// =====================================================
// SUPABASE CLIENT CONFIGURATION
// =====================================================
import { createClient } from "@supabase/supabase-js";

let _supabaseAdmin = null;

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    // FIX #8: Fail hard — never silently downgrade to anon key.
    // The admin client MUST bypass RLS; using the anon key would silently break all admin operations.
    if (!supabaseUrl || !supabaseServiceKey || supabaseServiceKey.includes("YOUR_SUPABASE")) {
      throw new Error(
        "FATAL: SUPABASE_SERVICE_KEY is missing or invalid. " +
        "Set it in your .env file or deployment environment variables. " +
        "Do NOT use the anon key for server-side admin operations."
      );
    }

    _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _supabaseAdmin;
}

// Admin client (bypasses RLS - use carefully!)
export const supabaseAdmin = new Proxy({}, {
  get(target, prop) {
    return getSupabaseAdmin()[prop];
  }
});

// Standard Anon Client (Safe for verifying tokens when Service Key is not set)
let _supabaseAnon = null;
export const supabaseAnon = new Proxy({}, {
  get(target, prop) {
    if (!_supabaseAnon) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Missing Supabase Anon environment variables");
      }
      _supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);
    }
    return _supabaseAnon[prop];
  }
});

// Helper to create user-specific client
export function createUserClient(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables");
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
