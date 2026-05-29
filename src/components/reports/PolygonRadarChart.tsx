export type RadarDatum = { subject: string; score: number };

type PolygonRadarChartProps = {
  data: RadarDatum[];
};

/** N각형 방사형 차트 (점수 0~100) */
export function PolygonRadarChart({ data }: PolygonRadarChartProps) {
  const size = 300;
  const center = size / 2;
  const radius = 100;
  const levels = 5;
  const totalPoints = data.length;
  if (totalPoints < 3) {
    return (
      <p className="text-center text-sm text-gray-500">역량 항목이 3개 이상일 때 차트가 표시됩니다.</p>
    );
  }

  const getPoint = (value: number, index: number, total: number) => {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    const r = (Math.min(100, Math.max(0, value)) / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  const gridPolygons = Array.from({ length: levels }).map((_, levelIndex) => {
    const levelValue = (100 / levels) * (levelIndex + 1);
    const points = data.map((_, i) => getPoint(levelValue, i, totalPoints));
    const pointString = points.map((p) => `${p.x},${p.y}`).join(" ");
    return (
      <polygon
        key={`grid-${levelIndex}`}
        points={pointString}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={1}
      />
    );
  });

  const axes = data.map((_, i) => {
    const p = getPoint(100, i, totalPoints);
    return (
      <line
        key={`axis-${i}`}
        x1={center}
        y1={center}
        x2={p.x}
        y2={p.y}
        stroke="#e5e7eb"
        strokeWidth={1}
      />
    );
  });

  const dataPoints = data.map((d, i) => getPoint(d.score, i, totalPoints));
  const dataPointString = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg width="100%" height="100%" viewBox="0 0 300 300" className="mx-auto max-w-[280px]">
      {gridPolygons}
      {axes}
      <polygon
        points={dataPointString}
        fill="rgba(252, 211, 77, 0.4)"
        stroke="#fbbf24"
        strokeWidth={2}
      />
      {data.map((d, i) => {
        const labelPoint = getPoint(118, i, totalPoints);
        return (
          <text
            key={`label-${i}`}
            x={labelPoint.x}
            y={labelPoint.y}
            textAnchor="middle"
            alignmentBaseline="middle"
            fill="#4b5563"
            fontSize={11}
            fontWeight={600}
          >
            {d.subject}
          </text>
        );
      })}
    </svg>
  );
}
