import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types/database";

const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

/** Supabase가 설정되지 않은 경우 null (UI에서 안내) */
export const supabase: SupabaseClient<Database> | null =
  url && anon ? createClient<Database>(url, anon) : null;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anon);
}
