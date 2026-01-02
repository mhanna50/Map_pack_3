const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Scheduled: { bg: "bg-slate-100", text: "text-slate-700" },
  Posted: { bg: "bg-emerald-100", text: "text-emerald-700" },
  Failed: { bg: "bg-rose-100", text: "text-rose-700" },
  "Needs approval": { bg: "bg-amber-100", text: "text-amber-800" },
  Draft: { bg: "bg-slate-100", text: "text-slate-600" },
};

type StatusBadgeProps = {
  status: string;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = STATUS_STYLES[status] ?? { bg: "bg-slate-100", text: "text-slate-700" };
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${normalized.bg} ${normalized.text}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
