"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Drawer } from "@/components/drawer";
import { useToast } from "@/components/toast";

const tabs = ["Inbox", "Published replies", "Templates"];
const reviews = [
  { id: 1, rating: 2, text: "Tech arrived late but fixed the issue.", status: "Needs approval", sentiment: "Negative", suggested: "Thanks for your patience..." },
  { id: 2, rating: 5, text: "Great experience!", status: "Auto-replied", sentiment: "Positive", suggested: "" },
  { id: 3, rating: 3, text: "Good service but took a while.", status: "Needs approval", sentiment: "Neutral", suggested: "We appreciate the feedback..." },
];

const metrics = [
  { label: "Avg rating", value: "4.7", change: "+0.2 vs last month" },
  { label: "Response time", value: "1h 44m", change: "Goal < 2h" },
  { label: "Review velocity", value: "6 / week", change: "Better than peers" },
  { label: "Unanswered reviews", value: "2", change: "Needs attention" },
];

export default function ReviewsPage() {
  const [selectedTab, setSelectedTab] = useState("Inbox");
  const [selectedReview, setSelectedReview] = useState<(typeof reviews)[0] | null>(null);
  const { pushToast } = useToast();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary">Reviews & replies</p>
            <h1 className="text-2xl font-semibold">Every review answered fast</h1>
          </div>
          <div className="text-xs text-slate-500">
            Auto reply ⭐️ 4+ &bull; Notify ⭐️ 3 or below
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{metric.label}</p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{metric.value}</p>
            <p className="text-xs text-slate-500">{metric.change}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-3">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              selectedTab === tab ? "bg-primary text-white" : "border border-slate-200 text-slate-600"
            }`}
            onClick={() => setSelectedTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {selectedTab === "Templates" ? (
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Brand voice snippets</h3>
          <p className="text-sm text-slate-600">Save your preferred phrases so AI replies stay on-brand.</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li>👍 “Thanks for trusting our local team.”</li>
            <li>⚠️ “We’re DM’ing you to make this right.”</li>
            <li>💡 “Reminder: we cover {`{service_area}`} 24/7.”</li>
          </ul>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                onClick={() => setSelectedReview(review)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{"⭐️".repeat(review.rating)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        review.sentiment === "Negative"
                          ? "bg-rose-100 text-rose-700"
                          : review.sentiment === "Positive"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {review.sentiment}
                    </span>
                  </div>
                  <StatusBadge status={review.status} />
                </div>
                <p className="mt-3 text-sm text-slate-700">{review.text}</p>
                {review.suggested && (
                  <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
                    <p className="text-xs font-semibold text-slate-500">Suggested reply</p>
                    <p>{review.suggested}</p>
                    <div className="flex gap-2 text-xs font-semibold">
                      <button
                        className="rounded-full bg-primary px-4 py-2 text-white"
                        onClick={(event) => {
                          event.stopPropagation();
                          pushToast({ title: "Reply approved", description: "We’ll publish it within a minute.", tone: "success" });
                        }}
                      >
                        Approve
                      </button>
                      <button className="rounded-full border border-slate-200 px-4 py-2 text-slate-600">Edit</button>
                      <button
                        className="rounded-full border border-slate-200 px-4 py-2 text-slate-600"
                        onClick={(event) => {
                          event.stopPropagation();
                          pushToast({ title: "Escalated", description: "We’ll notify the owner.", tone: "error" });
                        }}
                      >
                        Escalate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-4 shadow-sm">
              <h3 className="text-lg font-semibold">Inbox filters</h3>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked /> Needs approval
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" /> Auto replied
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" /> Escalated
                </label>
              </div>
            </div>
            <div className="rounded-3xl border border-dashed border-slate-200 p-4 text-sm text-slate-600">
              <p className="text-xs uppercase tracking-[0.3em] text-primary">SLA reminder</p>
              <p className="mt-2">Average response time is 1h 44m. We pause automations if it exceeds 6h.</p>
            </div>
          </div>
        </div>
      )}

      <Drawer open={Boolean(selectedReview)} onClose={() => setSelectedReview(null)} title="Review detail">
        {selectedReview && (
          <div className="space-y-4 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-primary">Rating</p>
                <p className="text-lg font-semibold">⭐️ {selectedReview.rating}</p>
              </div>
              <StatusBadge status={selectedReview.status} />
            </div>
            <p>{selectedReview.text}</p>
            <div className="rounded-2xl bg-slate-50 p-3 text-sm">
              <p className="text-xs font-semibold text-slate-500">Suggested reply</p>
              <textarea className="mt-2 w-full rounded-2xl border border-slate-200 p-2" rows={4} defaultValue={selectedReview.suggested} />
              <div className="mt-3 flex gap-2 text-xs font-semibold">
                <button
                  className="rounded-full bg-primary px-4 py-2 text-white"
                  onClick={() => {
                    pushToast({ title: "Reply approved", description: "We’ll publish it shortly.", tone: "success" });
                    setSelectedReview(null);
                  }}
                >
                  Approve
                </button>
                <button className="rounded-full border border-slate-200 px-4 py-2 text-slate-600">Edit</button>
                <button
                  className="rounded-full border border-slate-200 px-4 py-2 text-slate-600"
                  onClick={() => {
                    pushToast({ title: "Escalated", description: "We’ll notify the owner.", tone: "error" });
                    setSelectedReview(null);
                  }}
                >
                  Escalate
                </button>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
