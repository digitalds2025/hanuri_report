import { useState } from "react";
import { generateGrowthMomentWithGemini } from "../../lib/geminiGrowthMoment";
import {
  PRESET_ACTIVITY_KEYWORDS,
  PRESET_ATTITUDE_KEYWORDS,
} from "../../lib/growthMomentOptions";
import type { GrowthMetaState } from "../../lib/monthlyGrowthMeta";

export type { GrowthMetaState } from "../../lib/monthlyGrowthMeta";
export {
  growthMetaStateToJson,
  growthMetaFromJson,
  buildMonthlyGrowthMetaJson,
} from "../../lib/monthlyGrowthMeta";

type Props = {
  meta: GrowthMetaState;
  onMetaChange: (m: GrowthMetaState) => void;
  growthText: string;
  onGrowthTextChange: (t: string) => void;
  /** true면 키워드·메모만 (위저드 1단). AI·본문 textarea 숨김 */
  inputsOnly?: boolean;
};

function toggleInList(list: string[], item: string): string[] {
  const i = list.indexOf(item);
  if (i >= 0) {
    const next = [...list];
    next.splice(i, 1);
    return next;
  }
  return [...list, item];
}

function KeywordRow({
  label,
  hint,
  presets,
  selected,
  onChange,
  customPlaceholder,
}: {
  label: string;
  hint: string;
  presets: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  customPlaceholder: string;
}) {
  const [draft, setDraft] = useState("");

  function addCustom() {
    const t = draft.trim();
    if (!t) return;
    if (selected.includes(t)) {
      setDraft("");
      return;
    }
    onChange([...selected, t]);
    setDraft("");
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const on = selected.includes(p);
          return (
            <button
              key={p}
              type="button"
              aria-pressed={on}
              className={
                on
                  ? "rounded-full border border-indigo-600 bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
              }
              onClick={() => onChange(toggleInList(selected, p))}
            >
              {p}
            </button>
          );
        })}
      </div>
      {selected.length > 0 ? (
        <p className="text-xs text-slate-600">
          선택됨:{" "}
          {selected.map((s) => (
            <button
              key={s}
              type="button"
              className="mr-1 inline-block rounded bg-white px-1.5 py-0.5 text-indigo-700 underline decoration-dotted hover:bg-slate-100"
              onClick={() => onChange(selected.filter((x) => x !== s))}
              title="클릭하여 제거"
            >
              {s} ×
            </button>
          ))}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder={customPlaceholder}
        />
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          onClick={addCustom}
        >
          직접 추가
        </button>
      </div>
    </div>
  );
}

export function GrowthMomentForm({
  meta,
  onMetaChange,
  growthText,
  onGrowthTextChange,
  inputsOnly = false,
}: Props) {
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);

  async function runGemini() {
    setAiErr(null);
    if (meta.step1.length === 0 || meta.step2.length === 0) {
      setAiErr("1단·2단을 각각 한 가지 이상 선택하거나 추가해 주세요.");
      return;
    }
    setAiBusy(true);
    try {
      const text = await generateGrowthMomentWithGemini({
        step1Activities: meta.step1,
        step2Attitudes: meta.step2,
        step3TeacherNotes: meta.step3,
      });
      onGrowthTextChange(text);
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <KeywordRow
        label="1단 · 활동 영역 (필수)"
        hint="무엇을 했는가 — 프리셋을 눌러 선택하거나, 아래에서 직접 추가하세요."
        presets={PRESET_ACTIVITY_KEYWORDS}
        selected={meta.step1}
        onChange={(step1) => onMetaChange({ ...meta, step1 })}
        customPlaceholder="예: 문해력 수업, 독후감 쓰기"
      />
      <KeywordRow
        label="2단 · 태도 및 행동 (필수)"
        hint="해당 활동에서 보인 구체적 모습 — 프리셋 또는 직접 추가."
        presets={PRESET_ATTITUDE_KEYWORDS}
        selected={meta.step2}
        onChange={(step2) => onMetaChange({ ...meta, step2 })}
        customPlaceholder="예: 차분히 경청하는"
      />
      <label className="block text-sm">
        <span className="text-slate-600">3단 · 교사 학습 기록 (선택)</span>
        <textarea
          className="mt-1 min-h-[72px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          value={meta.step3}
          onChange={(e) => onMetaChange({ ...meta, step3: e.target.value })}
          placeholder="수업 중 관찰한 내용을 자유롭게 적어 주세요. 비워 두어도 됩니다."
        />
      </label>

      {!inputsOnly && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={aiBusy}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-100 disabled:opacity-60"
              onClick={() => void runGemini()}
            >
              {aiBusy ? "Gemini 생성 중…" : "AI로 성장 모멘트 글 생성하기 (3문단)"}
            </button>
            {aiErr ? <p className="text-sm text-red-600">{aiErr}</p> : null}
          </div>

          <label className="block text-sm">
            <span className="text-slate-600">성장 모멘트 본문 (생성 후 수정 가능)</span>
            <textarea
              className="mt-1 min-h-[140px] w-full rounded-lg border border-slate-300 px-3 py-2 font-serif text-[15px] leading-relaxed"
              value={growthText}
              onChange={(e) => onGrowthTextChange(e.target.value)}
              placeholder="위에서 AI 생성을 실행하거나, 직접 작성해 주세요."
            />
          </label>
        </>
      )}
    </div>
  );
}
