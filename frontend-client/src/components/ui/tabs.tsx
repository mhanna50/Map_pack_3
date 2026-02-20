"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type Tab = { value: string; label: string; badge?: React.ReactNode };

type TabsProps = {
  tabs: Tab[];
  value: string;
  onValueChange?: (value: string) => void;
  className?: string;
};

export function Tabs({ tabs, value, onValueChange, className }: TabsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 p-1 text-sm", className)}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onValueChange?.(tab.value)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition",
              active ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{tab.label}</span>
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}
