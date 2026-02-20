"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/toast";

type MediaItem = {
  id: number;
  label: string;
  tag: string;
  lastUsed: string;
  recommended?: boolean;
};

const mediaItems: MediaItem[] = [
  { id: 1, label: "Maintenance team", tag: "Team", lastUsed: "2 days ago" },
  { id: 2, label: "Before/after coil cleaning", tag: "Before/After", lastUsed: "7 days ago", recommended: true },
  { id: 3, label: "Thermostat install", tag: "Equipment", lastUsed: "14 days ago" },
];

const tags = ["All", "Before/After", "Team", "Equipment"];

export default function MediaLibraryPage() {
  const [selectedTag, setSelectedTag] = useState("All");
  const { pushToast } = useToast();
  const filteredItems = useMemo(
    () => (selectedTag === "All" ? mediaItems : mediaItems.filter((item) => item.tag === selectedTag)),
    [selectedTag],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Media library</h1>
          <p className="text-sm text-slate-600">Upload, tag, and reuse photos across locations.</p>
        </div>
        <div className="flex gap-2 text-sm font-semibold">
          <button
            className="rounded-full border border-slate-200 px-4 py-2 text-slate-700"
            onClick={() => pushToast({ title: "Upload requested", description: "We’ll notify the client for fresh photos." })}
          >
            Request upload
          </button>
          <label className="rounded-full bg-primary px-4 py-2 text-white">
            Upload media
            <input type="file" className="hidden" />
          </label>
        </div>
      </header>
      <div className="flex flex-wrap gap-2 text-sm">
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => setSelectedTag(tag)}
            className={`rounded-full px-4 py-2 font-semibold ${
              selectedTag === tag ? "bg-slate-900 text-white" : "bg-white text-slate-600 shadow-sm"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
      {filteredItems.length === 0 ? (
        <EmptyState
          title="No media for this tag"
          description="Upload assets or request the team to add more photos."
          actionLabel="Upload media"
          onAction={() => pushToast({ title: "Upload", description: "Drag files into the uploader to add them." })}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {filteredItems.map((item) => (
            <div key={item.id} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="h-36 rounded-xl bg-slate-100" />
              <div>
                <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                <p className="text-xs text-slate-500">Last used {item.lastUsed}</p>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">{item.tag}</span>
                {item.recommended && <span className="text-emerald-600">Recommended</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
