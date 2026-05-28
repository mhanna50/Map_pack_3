"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, MapPin } from "lucide-react";
import { useTenant } from "@/features/tenants/tenant-context";
import { cn } from "@/lib/utils";

export function LocationSelect() {
  const { locations, selectedLocationId, setSelectedLocationId } = useTenant();
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => locations.find((loc) => loc.id === selectedLocationId), [locations, selectedLocationId]);

  const options = [{ id: "all", name: "All locations" }, ...locations];

  const handleSelect = (id: string) => {
    const value = id === "all" ? null : id;
    setSelectedLocationId(value);
    setOpen(false);
  };

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:border-primary md:w-auto"
      >
        <MapPin className="h-4 w-4 text-primary" />
        <div className="min-w-0 text-left">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Location</p>
          <p className="truncate text-sm">{selected?.name ?? "All locations"}</p>
        </div>
        <ChevronsUpDown className="ml-1 h-4 w-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-30 mt-2 w-full min-w-64 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-white shadow-xl md:w-64">
          <div className="max-h-72 divide-y divide-border overflow-y-auto p-1">
            {options.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => handleSelect(loc.id)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-muted/60",
                  selectedLocationId === loc.id || (!selectedLocationId && loc.id === "all") ? "bg-muted/80" : "",
                )}
              >
                <span className="mt-1 h-2 w-2 rounded-full bg-primary/70" />
                <div>
                  <p className="font-semibold text-foreground">{loc.name}</p>
                  {"is_active" in loc && loc.is_active === false && (
                    <p className="text-xs text-muted-foreground">Inactive</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
