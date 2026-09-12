// Cookie and localStorage helpers for persistent session

const STORAGE_KEY = 'synta_vip_session';
const COOKIE_NAME = 'synta_vip_id';

export interface StoredSession {
  id: string;
  full_name: string;
  email: string;
  track?: string;
  tier?: string;
  score?: number;
  completed?: boolean;
}

export function saveSession(session: StoredSession): void {
  if (typeof window === 'undefined') return;
  
  // localStorage
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  
  // Cookie (expires in 30 days)
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(session))}; expires=${expires.toUTCString()}; path=/; SameSite=Strict`;
}

export function getSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
    
    // Fall back to cookie
    const cookie = document.cookie
      .split('; ')
      .find(row => row.startsWith(`${COOKIE_NAME}=`));
    
    if (cookie) {
      const value = decodeURIComponent(cookie.split('=').slice(1).join('='));
      return JSON.parse(value);
    }
  } catch {
    clearSession();
  }
  
  return null;
}

export function updateSession(updates: Partial<StoredSession>): void {
  const current = getSession();
  if (!current) return;
  saveSession({ ...current, ...updates });
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}
