"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Drawer } from "@/components/drawer";
import { useToast } from "@/components/toast";

const tabs = ["Needs approval", "Auto-replied", "All reviews"];
const reviews = [
  {
    id: 1,
    rating: 2,
    text: "Tech arrived late but fixed the issue.",
    status: "Needs approval",
    suggested: "Thanks for your patience...",
  },
  { id: 2, rating: 5, text: "Great experience!", status: "Auto-replied", suggested: "" },
];

export default function ReviewsPage() {
  const [selectedReview, setSelectedReview] = useState<(typeof reviews)[0] | null>(null);
  const { pushToast } = useToast();
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reviews</h1>
          <p className="text-sm text-slate-600">Inbox of all GBP reviews and replies.</p>
        </div>
        <div className="flex gap-2 text-xs text-slate-500">
          <span>Auto-reply threshold: ⭐️ 4+</span>
          <span>|</span>
          <span>Notify on ⭐️ 3 or less</span>
        </div>
      </header>
      <div className="flex gap-3">
        {tabs.map((tab) => (
          <button key={tab} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            {tab}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {reviews.map((review) => (
          <div
            key={review.id}
            className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
            onClick={() => setSelectedReview(review)}
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{"⭐️".repeat(review.rating)}</span>
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
                      pushToast({ title: "Reply rejected", description: "We’ll mark it for manual follow-up.", tone: "error" });
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}
           </div>
        ))}
      </div>
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
                    pushToast({ title: "Reply rejected", description: "We’ll notify the owner.", tone: "error" });
                    setSelectedReview(null);
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
