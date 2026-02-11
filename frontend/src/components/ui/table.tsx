"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <table ref={ref} className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  ),
);
Table.displayName = "Table";

export const THead = ({ children }: { children: React.ReactNode }) => (
  <thead className="bg-muted/60 text-muted-foreground">{children}</thead>
);

export const TBody = ({ children }: { children: React.ReactNode }) => <tbody className="divide-y divide-border">{children}</tbody>;

export const TR = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <tr className={cn("transition hover:bg-muted/40", className)}>{children}</tr>
);

export const TH = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <th className={cn("px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide", className)}>{children}</th>
);

export const TD = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <td className={cn("px-4 py-3 align-middle text-sm", className)}>{children}</td>
);
