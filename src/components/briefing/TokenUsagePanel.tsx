import type { LocalEduTokenLedger } from "../../lib/localEdu/tokenUsage";
import { formatStageTokens } from "../../lib/localEdu/tokenUsage";

type TokenUsagePanelProps = {
  ledger: LocalEduTokenLedger;
  /** 표시할 단계 키 — 비우면 전체 */
  highlight?: keyof LocalEduTokenLedger | "all";
  compact?: boolean;
};

const STAGE_LABELS: Record<keyof LocalEduTokenLedger, string> = {
  dataCollection: "① 데이터 수집",
  topicSelection: "② 주제 선정",
  manuscript: "③ 설명자료 줄글 (종합 레포트)",
  slidePlanning: "④ 슬라이드 기획",
  slideProduction: "⑤ 슬라이드 제작 (조립·상담키트)",
};

function totalLedger(ledger: LocalEduTokenLedger) {
  const keys = Object.keys(STAGE_LABELS) as (keyof LocalEduTokenLedger)[];
  return keys.reduce(
    (acc, k) => ({
      input: acc.input + ledger[k].inputTokens,
      output: acc.output + ledger[k].outputTokens,
    }),
    { input: 0, output: 0 },
  );
}

export function TokenUsagePanel({
  ledger,
  highlight = "all",
  compact = false,
}: TokenUsagePanelProps) {
  const total = totalLedger(ledger);
  const keys = Object.keys(STAGE_LABELS) as (keyof LocalEduTokenLedger)[];
  const showKeys =
    highlight === "all"
      ? keys
      : keys.filter((k) => {
          const order: (keyof LocalEduTokenLedger)[] = [
            "dataCollection",
            "topicSelection",
            "manuscript",
            "slidePlanning",
            "slideProduction",
          ];
          return order.indexOf(k) <= order.indexOf(highlight);
        });

  if (compact) {
    const u = highlight !== "all" ? ledger[highlight] : null;
    if (highlight !== "all" && u) {
      return (
        <p className="text-xs text-emerald-800">
          Gemini 토큰 · {STAGE_LABELS[highlight]} — {formatStageTokens(u)}
        </p>
      );
    }
    return (
      <p className="text-xs text-emerald-800">
        Gemini 토큰 합계 — 입력 {total.input.toLocaleString("ko-KR")} · 출력{" "}
        {total.output.toLocaleString("ko-KR")}
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950">
      <p className="font-bold">Gemini API 토큰 사용량</p>
      <ul className="mt-2 space-y-1.5 text-xs">
        {showKeys.map((k) => {
          const u = ledger[k];
          const hasUsage = u.inputTokens > 0 || u.outputTokens > 0;
          if (!hasUsage && highlight !== "all") return null;
          return (
            <li
              key={k}
              className={highlight === k ? "font-semibold text-indigo-800" : ""}
            >
              <span className="text-emerald-800">{STAGE_LABELS[k]}</span>
              {" — "}
              {hasUsage ? formatStageTokens(u) : "—"}
            </li>
          );
        })}
      </ul>
      {highlight === "all" ? (
        <p className="mt-2 border-t border-emerald-200/80 pt-2 text-xs font-semibold">
          합계 — 입력 {total.input.toLocaleString("ko-KR")} · 출력{" "}
          {total.output.toLocaleString("ko-KR")}
        </p>
      ) : null}
    </div>
  );
}
