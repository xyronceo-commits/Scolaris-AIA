import { createClient, type User } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment (.env locally, hosting env vars in production).'
  );
}

export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'missing-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
);

/** Minimal user shape used across the UI. */
export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
}

export function toAuthUser(user: User): AuthUser {
  return {
    uid: user.id,
    email: user.email ?? null,
    emailVerified: !!user.email_confirmed_at,
    displayName: (user.user_metadata?.full_name as string | undefined) ?? null,
  };
}

let currentUserId: string | undefined;

/** Called by the auth listener in App so non-React code can read the signed-in user synchronously. */
export function setCurrentUserId(id: string | undefined) {
  currentUserId = id;
}

export function getCurrentUserId(): string | undefined {
  return currentUserId;
}

/** Access token for calling our own /api routes. */
export async function getAccessToken(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}
