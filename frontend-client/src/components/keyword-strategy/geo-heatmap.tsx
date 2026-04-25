"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type HeatCell = {
  row: number;
  column: number;
  rank: number | null;
  rank_band?: string | null;
  color_hex?: string | null;
};

type ScanPayload = {
  average_rank: number | null;
  best_rank: number | null;
  worst_rank: number | null;
  visibility_score: number | null;
  total_points: number;
  grid: {
    rows: number;
    columns: number;
  };
  cells: HeatCell[];
};

export function GeoHeatmap({
  title,
  subtitle,
  scan,
}: {
  title: string;
  subtitle: string;
  scan?: ScanPayload | null;
}) {
  const rows = scan?.grid?.rows ?? 0;
  const columns = scan?.grid?.columns ?? 0;
  const byCell = new Map((scan?.cells ?? []).map((cell) => [`${cell.row}-${cell.column}`, cell]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!scan ? (
          <EmptyState inline title="Scan not available" description="This scan has not been completed yet." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <Metric label="Avg rank" value={scan.average_rank ?? "-"} />
              <Metric label="Best rank" value={scan.best_rank ?? "-"} />
              <Metric label="Worst rank" value={scan.worst_rank ?? "-"} />
              <Metric label="Visibility" value={scan.visibility_score != null ? `${scan.visibility_score}%` : "-"} />
            </div>
            <div className="grid gap-1 rounded-xl border border-border bg-muted/20 p-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {Array.from({ length: rows * columns }, (_, index) => {
                const row = Math.floor(index / columns);
                const column = index % columns;
                const cell = byCell.get(`${row}-${column}`);
                const rank = cell?.rank ?? null;
                const color = cell?.color_hex ?? "#b91c1c";
                return (
                  <div
                    key={`${row}-${column}`}
                    className="flex aspect-square items-center justify-center rounded-md text-[10px] font-semibold text-white shadow-sm"
                    style={{ backgroundColor: color }}
                    title={rank != null ? `Rank ${rank}` : "Not ranked"}
                  >
                    {rank ?? "NR"}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
