"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/toast";

const notifications = {
  All: [
    { id: 1, title: "Post published", detail: "Labor Day promo went live", status: "Posted", timestamp: "Just now" },
    { id: 2, title: "Review needs approval", detail: "⭐️ 2 from Dana", status: "Needs approval", timestamp: "5m ago" },
  ],
  Approvals: [{ id: 2, title: "Review needs approval", detail: "⭐️ 2 from Dana", status: "Needs approval", timestamp: "5m ago" }],
  System: [] as Array<{ id: number; title: string; detail: string; status: string; timestamp: string }>,
};

const tabs = Object.keys(notifications);

export default function NotificationsPage() {
  const [selectedTab, setSelectedTab] = useState<string>(tabs[0]);
  const { pushToast } = useToast();
  const currentNotifications = useMemo(() => notifications[selectedTab as keyof typeof notifications], [selectedTab]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-slate-600">In-app alerts so teams trust what’s happening.</p>
        </div>
        <button
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          onClick={() => pushToast({ title: "Marked as read", description: "You’re all caught up.", tone: "success" })}
        >
          Mark all read
        </button>
      </header>
      <div className="flex flex-wrap gap-2 text-sm">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setSelectedTab(tab)}
            className={`rounded-full px-4 py-2 font-semibold ${
              selectedTab === tab ? "bg-slate-900 text-white" : "bg-white text-slate-600 shadow-sm"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      {currentNotifications.length === 0 ? (
        <EmptyState
          title="Connect Google to start"
          description="Once your GBP is connected, automations and alerts will land here."
          actionLabel="Go to onboarding"
          href="/onboarding"
        />
      ) : (
        <div className="space-y-3">
          {currentNotifications.map((notification) => (
            <div key={notification.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{notification.title}</p>
                  <p className="text-sm text-slate-500">{notification.detail}</p>
                </div>
                <StatusBadge status={notification.status} />
              </div>
              <p className="mt-2 text-xs text-slate-400">{notification.timestamp}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
