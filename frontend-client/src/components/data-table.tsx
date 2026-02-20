"use client";

import { ReactNode } from "react";
import { Card } from "./ui/card";
import { EmptyState } from "./ui/empty-state";
import { Skeleton } from "./ui/skeleton";

type DataTableProps = {
  title?: string;
  description?: string;
  headers: ReactNode;
  rows: ReactNode;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
};

export function DataTable({ title, description, headers, rows, loading, error, emptyMessage }: DataTableProps) {
  return (
    <Card>
      {(title || description) && (
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            {title && <p className="text-sm font-semibold">{title}</p>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
      )}
      <div className="divide-y divide-border">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {headers}
        </div>
        <div className="min-h-[120px] px-6 py-3 text-sm">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : error ? (
            <EmptyState title="Something went wrong" description={error} inline />
          ) : rows ? (
            <div className="divide-y divide-border">{rows}</div>
          ) : (
            <EmptyState title={emptyMessage ?? "No data yet"} inline />
          )}
        </div>
      </div>
    </Card>
  );
}
