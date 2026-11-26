// =====================================================
// RETURN PATH VALIDATION
// Only same-site student pages may be used as a post-login destination.
// =====================================================

const MAX_RETURN_PATH_LENGTH = 512;

/**
 * Return the value if it is a safe in-app destination, otherwise null.
 * Accepts "/dashboard", "/app/..." and validated public "/session/<slug>" paths with an optional query string.
 */
export function safeReturnPath(value) {
  if (typeof value !== "string" || !value || value.length > MAX_RETURN_PATH_LENGTH) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(value) || value.includes("//")) return null;
  const match = /^(\/dashboard|\/app\/[A-Za-z0-9._~\-/]*|\/session(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?)(\?[^#]*)?$/.exec(value);
  if (!match || match[1].split("/").some(segment => segment === "." || segment === "..")) return null;
  if(match[1].startsWith("/session/") && ["admin","api","login","verify","status","questions","submit","register"].includes(match[1].split("/")[2]))return null;
  return value;
}

/**
 * Build the login URL for a protected page request.
 */
export function loginUrlFor(originalUrl, expired) {
  const next = safeReturnPath(originalUrl);
  const params = new URLSearchParams();
  if (next) params.set("next", next);
  if (expired) params.set("reason", "expired");
  const query = params.toString();
  return "/login" + (query ? "?" + query : "");
}
