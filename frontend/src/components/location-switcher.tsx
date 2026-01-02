"use client";

import { useMemo, useState } from "react";

type Location = {
  id: string;
  name: string;
  details?: string;
};

type LocationSwitcherProps = {
  orgName: string;
  locations: Location[];
  initialLocationId?: string;
  onSelect?: (id: string) => void;
};

export function LocationSwitcher({ orgName, locations, initialLocationId, onSelect }: LocationSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(initialLocationId ?? locations[0]?.id);

  const selected = useMemo(() => locations.find((loc) => loc.id === selectedId), [locations, selectedId]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    onSelect?.(id);
    setOpen(false);
  };

  return (
    <div className="relative text-left">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-primary"
      >
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{orgName}</p>
          <p className="text-sm font-semibold">{selected?.name ?? "Select location"}</p>
        </div>
        <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.944l3.71-3.712a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0l-4.25-4.25a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-64 rounded-2xl border border-slate-100 bg-white p-2 text-sm shadow-xl">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Locations</p>
          <div className="space-y-1">
            {locations.map((location) => (
              <button
                key={location.id}
                onClick={() => handleSelect(location.id)}
                className={`w-full rounded-xl px-3 py-2 text-left transition hover:bg-slate-50 ${
                  selectedId === location.id ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-600"
                }`}
              >
                <p>{location.name}</p>
                {location.details && <p className="text-xs text-slate-400">{location.details}</p>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
