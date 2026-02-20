"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
};

export function Dialog({ open, onOpenChange, title, description, children, footer, size = "md" }: DialogProps) {
  if (!open) return null;
  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-3xl" : "max-w-xl";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className={cn("w-full rounded-2xl border border-border bg-white shadow-2xl", width)}>
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            {title && <h3 className="text-lg font-semibold">{title}</h3>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted/50"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-3">{footer}</div>}
      </div>
    </div>
  );
}
