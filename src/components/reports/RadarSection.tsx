import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  type PillarKey,
  averagePillarOverMonths,
  pillarLabelsKo,
} from "../../lib/reportAggregates";
import type { Json } from "../../lib/types/database";

type Row = { competency_ratings: Json };

type Props = {
  /** 최근 월간 리포트들 (예: 최대 6건). */
  monthlyRows: Row[];
  title?: string;
};

const KEYS: PillarKey[] = ["reading", "thinking", "discussion", "writing", "growth"];

export function RadarSection({ monthlyRows, title = "최근 월간 역량 (평균)" }: Props) {
  const slice = monthlyRows.slice(0, 6);
  const avg = averagePillarOverMonths(slice);
  const chartData = KEYS.map((k) => ({
    subject: pillarLabelsKo[k],
    score: avg[k],
    fullMark: 10,
  }));
  const hasData = chartData.some((d) => d.score > 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-slate-800">{title}</h3>
      {!hasData ? (
        <p className="text-sm text-slate-500">역량 점수 데이터가 없습니다. 월간 리포트에 점수를 입력해 주세요.</p>
      ) : (
        <div className="h-64 w-full min-h-[220px] sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [`${String(value ?? "")} / 10`, "평균"]} />
              <Radar name="역량" dataKey="score" stroke="#4f46e5" fill="#818cf8" fillOpacity={0.45} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
