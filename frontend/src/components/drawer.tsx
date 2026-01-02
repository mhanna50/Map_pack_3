"use client";

import { useEffect } from "react";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export function Drawer({ open, onClose, title, children }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/40">
      <div className="h-full w-full max-w-md bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          <button className="text-sm text-slate-500" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-4 h-[calc(100%-3rem)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
