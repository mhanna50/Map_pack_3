"use client";

import { useState } from "react";
import { ApprovalQueueWidget, type ApprovalItem } from "@/components/approval-queue-widget";
import { Drawer } from "@/components/drawer";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/toast";
import { ActivityLog } from "@/components/activity-log";

const queueItems: ApprovalItem[] = [
  {
    id: "rev-1",
    type: "review",
    title: "⭐️ 2 • Late arrival complaint",
    location: "Downtown",
    submittedAt: "5m ago",
    status: "Needs approval",
  },
  {
    id: "post-1",
    type: "post",
    title: "Labor Day HVAC tune-up",
    location: "Uptown",
    submittedAt: "27m ago",
    status: "Needs approval",
  },
  {
    id: "edit-1",
    type: "edit",
    title: "Business hours adjustment",
    location: "Westside",
    submittedAt: "Yesterday",
    status: "Needs approval",
  },
];

const activityEntries = [
  { id: "1", title: "Luis approved ⭐️5 review reply", description: "Auto-posted at 8:05 AM", timestamp: "Today" },
  { id: "2", title: "Nina rejected risky listing edit", description: "Hours kept unchanged", timestamp: "Yesterday" },
];

export default function ApprovalsPage() {
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(queueItems[0]);
  const { pushToast } = useToast();

  const handleAction = (action: "approve" | "reject") => {
    pushToast({
      title: action === "approve" ? "Approved" : "Rejected",
      description: `We’ll ${action === "approve" ? "publish" : "notify the owner about"} this item.`,
      tone: action === "approve" ? "success" : "error",
    });
    setSelectedItem(null);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Safety hub</p>
        <h1 className="text-2xl font-semibold">Approval center</h1>
        <p className="text-sm text-slate-600">One queue for negative reviews, risky edits, and sensitive AI content.</p>
      </header>
      <ApprovalQueueWidget items={queueItems} onSelect={setSelectedItem} />
      <ActivityLog entries={activityEntries} />
      <Drawer open={Boolean(selectedItem)} onClose={() => setSelectedItem(null)} title={selectedItem?.title}>
        {selectedItem && (
          <div className="space-y-4 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-primary">{selectedItem.type}</p>
                <p className="text-base font-semibold text-slate-900">{selectedItem.location}</p>
              </div>
              <StatusBadge status={selectedItem.status} />
            </div>
            <p>This is placeholder context for how the automation generated the content. Replace with API data later.</p>
            <div className="flex gap-2 text-xs font-semibold">
              <button className="flex-1 rounded-full bg-primary px-4 py-2 text-white" onClick={() => handleAction("approve")}>
                Approve & publish
              </button>
              <button className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-slate-600" onClick={() => handleAction("reject")}>
                Reject
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
