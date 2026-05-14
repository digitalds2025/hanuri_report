import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { localListStudents } from "../lib/localStoreApi";
import type { Student } from "../lib/types/database";

export function useStudents() {
  const { user, requiresAuth } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (isSupabaseConfigured()) {
      if (!supabase) {
        setStudents([]);
        setLoading(false);
        setError("Supabase 미설정");
        return;
      }
      setLoading(true);
      let q = supabase.from("students").select("*").order("created_at", { ascending: false });
      if (requiresAuth && user) {
        q = q.eq("user_id", user.user_id);
      }
      const { data, error: e } = await q;
      if (e) setError(e.message);
      else {
        setError(null);
        setStudents(data ?? []);
      }
      setLoading(false);
      return;
    }

    if (!import.meta.env.DEV) {
      setStudents([]);
      setLoading(false);
      setError("로컬 파일 DB는 개발 서버(npm run dev)에서만 사용할 수 있습니다.");
      return;
    }

    setLoading(true);
    try {
      const list = await localListStudents();
      setError(null);
      setStudents(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStudents([]);
    }
    setLoading(false);
  }, [requiresAuth, user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { students, loading, error, refetch };
}
