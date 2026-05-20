import { isSupabaseConfigured } from "./supabaseClient";
import type { BriefingMaterialKit } from "./briefingMaterialTypes";
import { localListBriefingKits, localSaveBriefingKit } from "./localStoreApi";

const LS_KEY = "hanuri_briefing_material_kits";

function readLocalStorage(): BriefingMaterialKit[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as BriefingMaterialKit[]) : [];
  } catch {
    return [];
  }
}

function writeLocalStorage(kits: BriefingMaterialKit[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(kits));
}

export async function listBriefingMaterialKits(): Promise<BriefingMaterialKit[]> {
  if (import.meta.env.DEV && !isSupabaseConfigured()) {
    try {
      return await localListBriefingKits();
    } catch {
      /* fallback */
    }
  }
  return readLocalStorage();
}

export async function saveBriefingMaterialKit(kit: BriefingMaterialKit): Promise<void> {
  if (import.meta.env.DEV && !isSupabaseConfigured()) {
    await localSaveBriefingKit(kit);
    return;
  }
  const list = readLocalStorage();
  const idx = list.findIndex((k) => k.id === kit.id);
  if (idx >= 0) list[idx] = kit;
  else list.unshift(kit);
  writeLocalStorage(list);
}

export function newBriefingKitId(): string {
  return crypto.randomUUID();
}
