"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/toast";

const scheduledPosts = [
  { id: 1, title: "Winter furnace tune-up", type: "Offer", status: "Scheduled", datetime: "Jan 22 • 9:00 AM", channel: "Post + photo" },
  { id: 2, title: "New hire spotlight", type: "Update", status: "Draft", datetime: "Jan 24 • 11:30 AM", channel: "Post only" },
];

const pastPosts = [
  { id: 3, title: "Emergency weekend coverage", type: "Event", status: "Published", datetime: "Jan 18", engagement: "113 clicks" },
  { id: 4, title: "New thermostat installs", type: "Offer", status: "Published", datetime: "Jan 15", engagement: "94 clicks" },
];

const mediaLibrary = [
  { id: 1, label: "Before/after coil clean", status: "Approved", lastUsed: "3 days ago" },
  { id: 2, label: "Technician team", status: "Pending", lastUsed: "—" },
  { id: 3, label: "Smart thermostat install", status: "Approved", lastUsed: "8 days ago" },
];

export default function PostsPage() {
  const { pushToast } = useToast();
  const [aiPrompt, setAiPrompt] = useState("Offer: Furnace tune-up");

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Posts & media</p>
        <h1 className="text-2xl font-semibold">Consistency + creativity in one place</h1>
        <p className="text-sm text-slate-600">See the calendar, compose new ideas, and manage your photo library.</p>
      </header>

      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary">Calendar</p>
            <h3 className="text-lg font-semibold">Scheduled posts</h3>
          </div>
          <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Download calendar</button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {scheduledPosts.map((post) => (
            <div key={post.id} className="rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{post.title}</p>
                  <p className="text-xs text-slate-500">{post.datetime}</p>
                </div>
                <StatusBadge status={post.status} />
              </div>
              <p className="mt-3 text-xs text-slate-500">{post.type} • {post.channel}</p>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Recently published</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {pastPosts.map((post) => (
              <div key={post.id} className="rounded-2xl border border-slate-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{post.title}</p>
                    <p className="text-xs text-slate-500">{post.datetime}</p>
                  </div>
                  <p className="text-xs text-slate-500">{post.engagement}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Composer</h3>
          <p className="text-sm text-slate-600">AI rotates services, keywords, and cities automatically. You can nudge the prompt below.</p>
          <div className="mt-4 space-y-3 text-sm">
            <label className="block">
              <span className="text-slate-600">What should we highlight?</span>
              <textarea
                className="mt-1 w-full rounded-2xl border border-slate-200 p-3"
                rows={3}
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-slate-600">Schedule</span>
              <input type="datetime-local" className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2" />
            </label>
            <div className="flex items-center gap-3">
              <button
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white"
                onClick={() => pushToast({ title: "AI post created", description: "Draft saved to the queue.", tone: "success" })}
              >
                Generate draft
              </button>
              <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Attach media</button>
            </div>
          </div>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Media library</h3>
            <label className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white cursor-pointer">
              Upload
              <input type="file" className="hidden" multiple />
            </label>
          </div>
          <div className="mt-4 grid gap-3">
            {mediaLibrary.map((asset) => (
              <div key={asset.id} className="flex items-center justify-between rounded-2xl border border-slate-100 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{asset.label}</p>
                  <p className="text-xs text-slate-500">Last used {asset.lastUsed}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    asset.status === "Approved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {asset.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
