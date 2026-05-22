import type { OfficialDataScanResult, SlideDataRef } from "./briefingMaterialTypes";

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function buildFactCatalog(scan: OfficialDataScanResult): SlideDataRef[] {
  return scan.facts.slice(0, 80).map((f, i) => ({
    id: `fact-${i}`,
    category: f.category,
    fact: truncate(f.fact, 280),
    sourceTitle: f.sourceTitle,
    grade: f.grade,
  }));
}
