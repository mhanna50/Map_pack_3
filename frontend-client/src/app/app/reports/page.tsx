import { ActivityLog } from "@/components/activity-log";
import { StatusBadge } from "@/components/status-badge";

const kpis = [
  { title: "Reviews gained", value: "+12", change: "+3 vs last week" },
  { title: "Posts published", value: "4", change: "Steady" },
  { title: "Visibility score", value: "81", change: "+5 trend" },
];

const summaryRows = [
  { label: "Rank improvements", detail: "6 keywords moved into top 3", status: "Posted" },
  { label: "Approvals needed", detail: "2 negative reviews pending", status: "Needs approval" },
];

const activityEntries = [
  { id: "r1", title: "Weekly digest sent", description: "Delivered to owner + admin", timestamp: "Mon, 7:00 AM" },
  { id: "r2", title: "Rank alert triggered", description: "Water heater install dropped to #5", timestamp: "Sun, 5:14 PM" },
];

export default function ReportsPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-slate-600">Weekly summary of reviews, posts, visibility, and tasks.</p>
      </header>
      <section className="grid gap-4 md:grid-cols-3">
        {kpis.map((kpi) => (
          <div key={kpi.title} className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">{kpi.title}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{kpi.value}</p>
            <p className="text-sm text-slate-500">{kpi.change}</p>
          </div>
        ))}
      </section>
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary">Highlights</p>
            <h3 className="text-lg font-semibold">This week at a glance</h3>
          </div>
          <a href="#" className="text-sm font-semibold text-primary">
            Export PDF
          </a>
        </div>
        <div className="mt-4 space-y-3">
          {summaryRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between rounded-2xl border border-slate-100 p-4">
              <div>
                <p className="font-semibold text-slate-900">{row.label}</p>
                <p className="text-sm text-slate-500">{row.detail}</p>
              </div>
              <StatusBadge status={row.status} />
            </div>
          ))}
        </div>
      </section>
      <ActivityLog entries={activityEntries} />
    </div>
  );
}
