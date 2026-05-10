import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>;

function getClient(): DB {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } }) as DB;
}

// Lazy singleton — instantiated on first use so missing env vars don't break the build
let _client: DB | null = null;

export function db(): DB {
  if (!_client) _client = getClient();
  return _client;
}
