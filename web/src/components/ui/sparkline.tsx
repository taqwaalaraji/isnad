/** A tiny trend line; time runs left to right in both directions of text. */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return <span className={className} style={{ width, height, display: "inline-block" }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (width - 4) / (values.length - 1);
  const points = values.map((v, i) => [2 + i * step, height - 3 - ((v - min) / range) * (height - 6)] as const);
  const d = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = points[points.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden style={{ direction: "ltr" }}>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <rect x={lx - 2.5} y={ly - 2.5} width="5" height="5" transform={`rotate(45 ${lx} ${ly})`} fill="var(--accent)" />
    </svg>
  );
}
