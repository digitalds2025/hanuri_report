import { useEffect, useRef, useState } from "react";

type Props = {
  messages: string[];
  /** 진행 중이면 하단 점 애니메이션 */
  active?: boolean;
};

type Phase = "idle" | "exiting" | "entering";

const EXIT_MS = 420;
const ENTER_MS = 420;

/**
 * YES24/도서 수집 진행 문구 — 한 줄만 표시.
 * 문구가 바뀔 때 이전 글은 먼저 사라진 뒤(퇴장 애니), 그다음 새 글이 나타납니다(입장 애니).
 */
export function HanuriBookSearchProgress({ messages, active = false }: Props) {
  const [visible, setVisible] = useState<{ text: string; phase: Phase }>({ text: "", phase: "idle" });
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];

    const len = messages.length;
    const last = len > 0 ? messages[len - 1]! : "";

    if (!last) {
      setVisible({ text: "", phase: "idle" });
      return;
    }

    if (len === 1) {
      setVisible({ text: last, phase: "entering" });
      const t = setTimeout(() => setVisible({ text: last, phase: "idle" }), ENTER_MS);
      timersRef.current.push(t);
      return () => {
        for (const x of timersRef.current) clearTimeout(x);
        timersRef.current = [];
      };
    }

    const prevLine = messages[len - 2]!;
    setVisible({ text: prevLine, phase: "exiting" });
    const t1 = setTimeout(() => {
      setVisible({ text: last, phase: "entering" });
      const t2 = setTimeout(() => setVisible({ text: last, phase: "idle" }), ENTER_MS);
      timersRef.current.push(t2);
    }, EXIT_MS);
    timersRef.current.push(t1);

    return () => {
      for (const x of timersRef.current) clearTimeout(x);
      timersRef.current = [];
    };
  }, [messages]);

  if (!visible.text) return null;

  return (
    <div className="rounded-xl border border-violet-200/90 bg-gradient-to-b from-violet-50/95 to-white px-4 py-4 shadow-sm">
      <p className="text-xs font-semibold tracking-tight text-violet-700">한우리 AI</p>
      <div className="relative mt-3 min-h-[4rem] overflow-hidden">
        <p
          key={`${visible.text}-${visible.phase}`}
          className={
            visible.phase === "exiting"
              ? "text-[15px] leading-relaxed text-slate-600 [animation:hanuriOut_0.42s_ease forwards]"
              : visible.phase === "entering"
                ? "text-[15px] leading-relaxed text-slate-800 [animation:hanuriIn_0.42s_ease forwards]"
                : "text-[15px] leading-relaxed text-slate-800"
          }
        >
          {visible.text}
        </p>
      </div>
      {active ? (
        <div className="mt-3 flex items-center gap-1.5 pl-0.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400 opacity-70 [animation:hanuriDot_1s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
