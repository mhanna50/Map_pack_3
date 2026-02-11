"use client";

import { ReactNode } from "react";
import { Card, CardContent } from "./ui/card";

type KpiCardProps = {
  label: string;
  value: ReactNode;
  delta?: string;
  muted?: boolean;
  icon?: ReactNode;
};

export function KpiCard({ label, value, delta, muted, icon }: KpiCardProps) {
  return (
    <Card className={muted ? "bg-muted/40" : ""}>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <div className="mt-2 text-2xl font-semibold">{value}</div>
          {delta && <p className="text-xs text-muted-foreground">{delta}</p>}
        </div>
        {icon}
      </CardContent>
    </Card>
  );
}
