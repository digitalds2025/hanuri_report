import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

export const BOOK_CATALOG_OWNER_LOGIN_ID = "digitalds";
export const TEACHER_LOGIN_ID = "teacher";

let cachedCatalogOwnerUserId: string | null | undefined;

export function canRegisterBooks(loginId: string | null | undefined): boolean {
  return loginId?.trim() === BOOK_CATALOG_OWNER_LOGIN_ID;
}

export function shouldFilterBooksToCatalogOwner(loginId: string | null | undefined): boolean {
  return loginId?.trim() === TEACHER_LOGIN_ID;
}

export async function getCatalogOwnerUserId(): Promise<string | null> {
  if (cachedCatalogOwnerUserId !== undefined) {
    return cachedCatalogOwnerUserId;
  }
  if (!isSupabaseConfigured() || !supabase) {
    cachedCatalogOwnerUserId = null;
    return null;
  }
  const { data, error } = await supabase.rpc("get_catalog_owner_user_id");
  if (error) throw new Error(error.message);
  cachedCatalogOwnerUserId = typeof data === "string" && data.trim() ? data.trim() : null;
  return cachedCatalogOwnerUserId;
}

export function useBookCatalogScope(loginId: string | undefined, userId: string | undefined) {
  const [catalogOwnerUserId, setCatalogOwnerUserId] = useState<string | null>(null);
  const [catalogFilterReady, setCatalogFilterReady] = useState(
    () => !shouldFilterBooksToCatalogOwner(loginId),
  );

  useEffect(() => {
    let cancelled = false;
    if (!shouldFilterBooksToCatalogOwner(loginId)) {
      setCatalogOwnerUserId(null);
      setCatalogFilterReady(true);
      return;
    }
    setCatalogFilterReady(false);
    void getCatalogOwnerUserId()
      .then((id) => {
        if (!cancelled) setCatalogOwnerUserId(id);
      })
      .catch(() => {
        if (!cancelled) setCatalogOwnerUserId(null);
      })
      .finally(() => {
        if (!cancelled) setCatalogFilterReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loginId]);

  const canRegister = canRegisterBooks(loginId);

  return {
    canRegisterBooks: canRegister,
    catalogOwnerUserId,
    catalogFilterReady,
    registerAsUserId: canRegister ? (userId ?? null) : null,
  };
}
