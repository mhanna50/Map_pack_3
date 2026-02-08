import { useMemo } from "react";
import { ApprovalQueueWidget, type ApprovalItem } from "@/components/approval-queue-widget";
import { ActivityLog } from "@/components/activity-log";

const kpis = [
  {
    label: "Visibility score",
    value: 82,
    change: "+4 vs last week",
    href: "/app/rankings",
  },
  {
    label: "Avg map rank",
    value: "3.2",
    change: "Top keywords steady",
    href: "/app/rankings",
  },
  { label: "GBP actions", value: "182", change: "Calls/dir/web", href: "/app" },
  {
    label: "New reviews (30d)",
    value: "24",
    change: "Avg 4.7 ★",
    href: "/app/reviews",
  },
  { label: "Posts published", value: "8", change: "2 scheduled", href: "/app/posts" },
  { label: "Photos uploaded", value: "12", change: "Last 14 days", href: "/app/posts" },
];

const rankTrend = [
  { date: "Mon", score: 78 },
  { date: "Tue", score: 80 },
  { date: "Wed", score: 81 },
  { date: "Thu", score: 82 },
  { date: "Fri", score: 83 },
];

const reviewsTrend = [
  { date: "Week 1", count: 5, rating: 4.6 },
  { date: "Week 2", count: 6, rating: 4.7 },
  { date: "Week 3", count: 7, rating: 4.8 },
  { date: "Week 4", count: 6, rating: 4.7 },
];

const activityEntries = [
  { id: "a", title: "Posted offer: Winter furnace tune-up", description: "Auto-published to Downtown", timestamp: "Today 09:10" },
  { id: "b", title: "Replied to 8 reviews", description: "All auto-approved positive replies", timestamp: "Yesterday 17:42" },
  { id: "c", title: "Added 3 missing services", description: "Heat pump tune-up, smart thermostat, duct cleaning", timestamp: "Yesterday 11:08" },
  { id: "d", title: "Uploaded 5 photos", description: "Marked as fresh for rotation", timestamp: "Mon 15:21" },
  { id: "e", title: "Rank increase detected", description: "'plumber near me' moved +4", timestamp: "Sun 09:14" },
];

const alerts = [
  { id: "al-1", label: "Negative review needs approval", severity: "critical" },
  { id: "al-2", label: "GBP disconnected (Uptown)", severity: "warning" },
  { id: "al-3", label: "Need new photos (14d old)", severity: "info" },
  { id: "al-4", label: "Rank drop for 'emergency hvac'", severity: "warning" },
  { id: "al-5", label: "No posts in 7 days → scheduled", severity: "info" },
];

const approvalItems: ApprovalItem[] = [
  { id: "1", type: "review", title: "⭐️ 2 — Late technician", location: "Downtown", submittedAt: "5m ago", status: "Needs approval" },
  { id: "2", type: "edit", title: "Business hours edit", location: "Uptown", submittedAt: "1h ago", status: "Needs approval" },
  { id: "3", type: "post", title: "Emergency checklist post", location: "Mobile crews", submittedAt: "Yesterday", status: "Draft" },
];

export default function OverviewPage() {
  const rankTrendMax = useMemo(() => Math.max(...rankTrend.map((p) => p.score)), []);
  const reviewMax = useMemo(() => Math.max(...reviewsTrend.map((p) => p.count)), []);

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary">Pulse</p>
            <h2 className="mt-1 text-2xl font-semibold">Today&apos;s status: All automations running</h2>
          </div>
          <a href="/app/posts" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">
            Create post
          </a>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {kpis.map((kpi) => (
            <a key={kpi.label} href={kpi.href} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-primary">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{kpi.label}</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{kpi.value}</p>
              <p className="text-xs text-slate-500">{kpi.change}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-primary">Trend</p>
              <h3 className="text-lg font-semibold">Rank trajectory</h3>
            </div>
            <a href="/app/rankings" className="text-xs font-semibold text-primary">
              View detail
            </a>
          </div>
          <div className="mt-4 flex items-end gap-3">
            {rankTrend.map((point) => (
              <div key={point.date} className="flex-1">
                <div className="rounded-t-lg bg-primary/20" style={{ height: `${(point.score / rankTrendMax) * 120}px` }} />
                <p className="mt-2 text-xs text-center text-slate-500">{point.date}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-primary">Trend</p>
              <h3 className="text-lg font-semibold">Reviews velocity</h3>
            </div>
            <a href="/app/reviews" className="text-xs font-semibold text-primary">
              Open reviews
            </a>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {reviewsTrend.map((point) => (
              <div key={point.date} className="rounded-2xl border border-slate-100 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{point.date}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{point.count}</p>
                <p className="text-xs text-slate-500">Avg rating {point.rating}</p>
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(point.count / reviewMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-primary">Activity</p>
                <h3 className="text-lg font-semibold">What we did for you</h3>
              </div>
              <a href="/app/posts" className="text-xs font-semibold text-primary">
                View all
              </a>
            </div>
            <ActivityLog entries={activityEntries} />
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Alerts & attention</h3>
            <ul className="mt-4 space-y-3">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex items-center justify-between rounded-2xl border border-slate-100 p-3">
                  <p className="text-sm text-slate-700">{alert.label}</p>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      alert.severity === "critical"
                        ? "bg-rose-100 text-rose-700"
                        : alert.severity === "warning"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {alert.severity}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="space-y-6">
          <ApprovalQueueWidget items={approvalItems} actionHref="/app/reviews" />
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white/70 p-5 text-sm text-slate-600">
            <p className="text-xs uppercase tracking-[0.3em] text-primary">Health</p>
            <ul className="mt-3 space-y-2">
              <li>GBP connection: <span className="font-semibold text-emerald-600">Active</span></li>
              <li>Automation status: <span className="font-semibold text-emerald-600">Running</span></li>
              <li>Approval queue: <span className="font-semibold text-amber-600">2 items</span></li>
              <li>Audit log: <a href="/app/settings" className="text-primary underline">View</a></li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
