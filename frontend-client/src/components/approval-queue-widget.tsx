import { StatusBadge } from "./status-badge";

export type ApprovalItem = {
  id: string;
  type: "review" | "post" | "edit";
  title: string;
  location: string;
  submittedAt: string;
  status: string;
};

type ApprovalQueueWidgetProps = {
  title?: string;
  items: ApprovalItem[];
  actionHref?: string;
  onSelect?: (item: ApprovalItem) => void;
};

export function ApprovalQueueWidget({ title = "Approval queue", items, actionHref, onSelect }: ApprovalQueueWidgetProps) {
  return (
    <div className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Workflow</p>
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        {actionHref && (
          <a href={actionHref} className="text-sm font-semibold text-primary">
            View all
          </a>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Everything is approved. 🎉</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-500">
                    {item.location} • {item.submittedAt}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span className="uppercase tracking-[0.3em] text-slate-400">{item.type}</span>
                {onSelect && (
                  <button onClick={() => onSelect(item)} className="font-semibold text-primary">
                    Open
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
