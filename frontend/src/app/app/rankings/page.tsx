const keywords = [
  { name: "hvac repair downtown", rank: 2, change: "+1", coverage: "92%" },
  { name: "furnace install uptown", rank: 4, change: "-1", coverage: "78%" },
  { name: "ac tune up westside", rank: 1, change: "+0", coverage: "100%" },
];

const gridPoints = [
  { label: "Center", rank: 2 },
  { label: "North", rank: 3 },
  { label: "South", rank: 5 },
  { label: "East", rank: 4 },
  { label: "West", rank: 2 },
];

export default function RankingsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Rankings</h1>
        <p className="text-sm text-slate-600">Track visibility across keywords and geo-points.</p>
      </header>
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Visibility score</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">82</p>
          <p className="text-sm text-emerald-600">+4 vs last week</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Keywords tracked</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">24</p>
          <p className="text-sm text-slate-500">Across service areas</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Alerts</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">2</p>
          <p className="text-sm text-amber-600">Needs attention</p>
        </div>
      </section>
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary">Keywords</p>
            <h3 className="text-lg font-semibold">Top movers</h3>
          </div>
          <a href="#" className="text-sm font-semibold text-primary">
            Download CSV
          </a>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Keyword</th>
                <th className="px-3 py-2">Rank</th>
                <th className="px-3 py-2">Change</th>
                <th className="px-3 py-2">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((keyword) => (
                <tr key={keyword.name} className="border-t border-slate-100">
                  <td className="px-3 py-3 font-semibold text-slate-900">{keyword.name}</td>
                  <td className="px-3 py-3 text-slate-700">#{keyword.rank}</td>
                  <td className={`px-3 py-3 ${keyword.change.startsWith("+") ? "text-emerald-600" : "text-rose-600"}`}>{keyword.change}</td>
                  <td className="px-3 py-3 text-slate-500">{keyword.coverage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Geo grid snapshot</p>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {gridPoints.map((point) => (
            <div key={point.label} className="rounded-2xl border border-slate-100 p-4 text-center">
              <p className="text-xs font-semibold text-slate-500">{point.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">#{point.rank}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
