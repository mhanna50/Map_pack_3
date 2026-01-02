import { ApprovalQueueWidget } from "@/components/approval-queue-widget";
import { ActivityLog } from "@/components/activity-log";

const snapshots = {
  status: "All automations running",
  reviews: { avgRating: 4.7, newThisWeek: 6 },
  posts: { lastPost: "3 days ago", scheduled: 4 },
  rankings: { score: 78, trend: "+4" },
};

const quickActions = [
  { label: "Create Post", description: "Draft a new GBP update", href: "/app/posts" },
  { label: "Upload Photos", description: "Keep media fresh", href: "/app/media" },
  { label: "Approve Replies", description: "Clear the queue", href: "/app/approvals" },
];

const approvalItems = [
  { id: "1", type: "review", title: "⭐️ 2 — Delayed Service", location: "Downtown", submittedAt: "3m ago", status: "Needs approval" },
  { id: "2", type: "post", title: "Fall Tune-up offer", location: "Uptown", submittedAt: "1h ago", status: "Draft" },
  { id: "3", type: "edit", title: "Updated business hours", location: "Westside", submittedAt: "Yesterday", status: "Needs approval" },
];

const activityEntries = [
  { id: "a", title: "Post published • Summer tune-up", description: "Auto-posted to Downtown location", timestamp: "Today, 9:14 AM" },
  { id: "b", title: "Auto-replied to ⭐️5 review", description: "Thanks Sarah for sharing your experience.", timestamp: "Today, 8:03 AM" },
  { id: "c", title: "Queued Q&A batch", description: "Next 10 answers scheduled weekly", timestamp: "Yesterday, 4:44 PM" },
];

export default function OverviewPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-slate-500">Today&apos;s status</p>
        <h2 className="mt-2 text-2xl font-semibold">{snapshots.status}</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {quickActions.map((action) => (
            <a key={action.label} href={action.href} className="rounded-2xl border border-slate-100 p-4 shadow-sm transition hover:border-primary">
              <p className="text-sm font-semibold text-primary">{action.label}</p>
              <p className="text-sm text-slate-600">{action.description}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Reviews</p>
          <h3 className="mt-3 text-3xl font-semibold">{snapshots.reviews.avgRating.toFixed(1)} ⭐</h3>
          <p className="text-sm text-slate-600">{snapshots.reviews.newThisWeek} new this week</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Posts</p>
          <h3 className="mt-3 text-2xl font-semibold">Last post {snapshots.posts.lastPost}</h3>
          <p className="text-sm text-slate-600">{snapshots.posts.scheduled} scheduled</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Visibility</p>
          <h3 className="mt-3 text-3xl font-semibold">{snapshots.rankings.score}</h3>
          <p className="text-sm text-slate-600">Trend {snapshots.rankings.trend}</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <ApprovalQueueWidget items={approvalItems} actionHref="/app/approvals" />
        <ActivityLog entries={activityEntries} />
      </section>
    </div>
  );
}
