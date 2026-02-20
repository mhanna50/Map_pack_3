"use client";

import { useState } from "react";

const keywordRows = [
  { keyword: "hvac repair downtown", currentRank: 2, change7: "+1", change30: "+3", best: 1, area: "Downtown grid", notes: "Service page refreshed" },
  { keyword: "emergency furnace repair", currentRank: 4, change7: "-1", change30: "+1", best: 3, area: "Citywide 5mi", notes: "Needs new post" },
  { keyword: "plumber near me", currentRank: 7, change7: "+2", change30: "+5", best: 4, area: "Metro", notes: "" },
  { keyword: "duct cleaning services", currentRank: 3, change7: "+0", change30: "+1", best: 2, area: "Uptown grid", notes: "Competitor surge" },
];

const gridPoints = [
  { label: "NW", rank: 5 },
  { label: "N", rank: 3 },
  { label: "NE", rank: 4 },
  { label: "W", rank: 2 },
  { label: "Center", rank: 1 },
  { label: "E", rank: 3 },
  { label: "SW", rank: 4 },
  { label: "S", rank: 5 },
  { label: "SE", rank: 6 },
];

export default function RankingsPage() {
  const [view, setView] = useState<"table" | "map">("table");

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Rank tracking</p>
        <h1 className="text-2xl font-semibold">Keyword visibility</h1>
        <p className="text-sm text-slate-600">Prove the Map Pack is moving in the right direction, and see which keywords still need fuel.</p>
      </header>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Location
            <select className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm">
              <option>All locations</option>
              <option>Downtown</option>
              <option>Uptown</option>
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Keyword group
            <select className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm">
              <option>Core services</option>
              <option>Emergency</option>
              <option>Brand</option>
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Date range
            <select className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm">
              <option>Last 30 days</option>
              <option>Last 7 days</option>
              <option>Last 90 days</option>
            </select>
          </label>
          <div className="flex items-end justify-end">
            <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Download CSV</button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Keyword performance</h2>
          <div className="flex gap-2 text-sm">
            <button
              className={`rounded-full px-4 py-1 ${view === "table" ? "bg-primary text-white" : "bg-slate-100 text-slate-600"}`}
              onClick={() => setView("table")}
            >
              Table
            </button>
            <button
              className={`rounded-full px-4 py-1 ${view === "map" ? "bg-primary text-white" : "bg-slate-100 text-slate-600"}`}
              onClick={() => setView("map")}
            >
              Map
            </button>
          </div>
        </div>
        {view === "table" ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-400">
                  <th className="px-3 py-2">Keyword</th>
                  <th className="px-3 py-2">Current rank</th>
                  <th className="px-3 py-2">Δ 7d</th>
                  <th className="px-3 py-2">Δ 30d</th>
                  <th className="px-3 py-2">Best (90d)</th>
                  <th className="px-3 py-2">Grid / area</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {keywordRows.map((row) => (
                  <tr key={row.keyword} className="border-t border-slate-100">
                    <td className="px-3 py-3 font-semibold text-slate-900">{row.keyword}</td>
                    <td className="px-3 py-3 text-slate-700">#{row.currentRank}</td>
                    <td className={`px-3 py-3 ${row.change7.startsWith("+") ? "text-emerald-600" : "text-rose-600"}`}>{row.change7}</td>
                    <td className={`px-3 py-3 ${row.change30.startsWith("+") ? "text-emerald-600" : "text-rose-600"}`}>{row.change30}</td>
                    <td className="px-3 py-3 text-slate-600">#{row.best}</td>
                    <td className="px-3 py-3 text-slate-500">{row.area}</td>
                    <td className="px-3 py-3 text-slate-500">{row.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {gridPoints.map((point) => (
              <div key={point.label} className="rounded-2xl border border-slate-100 p-4 text-center shadow-sm">
                <p className="text-xs font-semibold text-slate-500">{point.label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">#{point.rank}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
