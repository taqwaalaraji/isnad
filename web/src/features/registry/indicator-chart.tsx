"use client";

import { useMemo, useRef, useState } from "react";

import { Segmented } from "@/components/ui/segmented";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

import { axisLabel, compactFigure, fullFigure, type Granularity, periodText } from "./format";
import type { ChartPoint } from "./indicator";

const WIDTH = 720;
const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 34, left: 56 };

/** Round tick steps (1, 2, 2.5, 5 × 10ⁿ) covering the data range. */
function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

/**
 * One indicator over time, for one scope: a single lapis line (no legend; the title names it),
 * a recessive grid, and a crosshair tooltip. The figures table below is the accessible table view.
 */
export function IndicatorChart({
  title,
  series,
  granularities,
  initial,
}: {
  title: string;
  series: Partial<Record<Granularity, ChartPoint[]>>;
  granularities: Granularity[];
  initial: Granularity;
}) {
  const { t, locale } = useI18n();
  const [kind, setKind] = useState<Granularity>(initial);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const points = useMemo(() => series[kind] ?? [], [series, kind]);
  const isPercent = points[0]?.unit === "%";
  const values = points.map((p) => (isPercent ? p.value : p.base));

  const ticks = values.length ? niceTicks(Math.min(...values), Math.max(...values)) : [];
  const yMin = ticks[0] ?? 0;
  const yMax = ticks[ticks.length - 1] ?? 1;
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
  const tickLabel = (v: number) =>
    isPercent ? `${Number(v.toFixed(2))}%` : compactFigure({ value: v, scale: "one", decimals: 0, unit: "" }, locale);
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(values[i]).toFixed(1)}`).join(" ");
  const area = points.length > 1 ? `${path} L${x(points.length - 1).toFixed(1)},${PAD.top + innerH} L${x(0).toFixed(1)},${PAD.top + innerH} Z` : "";

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  }

  const active = hover !== null ? points[hover] : null;
  const summary = points.length
    ? `${title}: ${points.map((p) => `${periodText(p.start, p.end, locale)} ${fullFigure(p, locale)}`).join("، ")}`
    : title;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 px-1">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {granularities.length > 1 && (
          <Segmented
            size="sm"
            label={t("registry.indicator.byPeriod")}
            value={kind}
            onChange={(v) => {
              setKind(v);
              setHover(null);
            }}
            options={granularities.map((g) => ({ value: g, label: t(`registry.indicator.granularity.${g}`) }))}
          />
        )}
      </div>
      {points.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">{t("registry.indicator.noFigures")}</p>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full touch-none select-none"
            style={{ direction: "ltr" }}
            role="img"
            aria-label={summary}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className="num fill-[var(--text-subtle)] text-[11px]">
                  {tickLabel(v)}
                </text>
              </g>
            ))}
            {points.map((p, i) =>
              i % labelEvery === 0 || i === points.length - 1 ? (
                <text key={p.id} x={x(i)} y={HEIGHT - 10} textAnchor="middle" className="num fill-[var(--text-subtle)] text-[11px]">
                  {axisLabel(p.start, p.end, locale)}
                </text>
              ) : null,
            )}
            {area && <path d={area} fill="var(--accent)" opacity={0.08} />}
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {active && hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" />
            )}
            {points.map((p, i) => (
              <circle
                key={p.id}
                cx={x(i)}
                cy={y(values[i])}
                r={hover === i ? 6 : 4}
                fill={p.revised ? "var(--surface)" : "var(--accent)"}
                stroke={p.revised ? "var(--accent)" : "var(--surface)"}
                strokeWidth={2}
              />
            ))}
          </svg>
          {active && hover !== null && (
            <div
              className="pointer-events-none absolute top-2 z-10 w-max max-w-[220px] rounded-md border border-border bg-surface-raised px-3 py-2 text-xs shadow-popover"
              style={x(hover) > WIDTH / 2 ? { right: `${((WIDTH - x(hover)) / WIDTH) * 100 + 2}%` } : { left: `${(x(hover) / WIDTH) * 100 + 2}%` }}
            >
              <p className="font-medium text-muted">{periodText(active.start, active.end, locale)}</p>
              <p className="num mt-0.5 text-sm font-semibold text-text">{fullFigure(active, locale)}</p>
              <p className="mt-1 text-muted">
                {active.revised ? t("registry.figureStatus.revised") : t(`registry.figureStatus.${active.status}`)}
                {active.fetchedAt && ` · ${t("registry.indicator.retrievedOn", { date: formatDate(active.fetchedAt, locale) })}`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
