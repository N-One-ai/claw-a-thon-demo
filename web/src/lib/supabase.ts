import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key || url.includes("placeholder")) {
    // Return a dummy client that won't crash — auth simply won't work
    _client = createClient("https://placeholder.supabase.co", "placeholder");
    return _client;
  }
  _client = createClient(url, key);
  return _client;
}
