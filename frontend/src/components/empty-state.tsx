type EmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  href?: string;
  onAction?: () => void;
};

export function EmptyState({ title, description, actionLabel, href, onAction }: EmptyStateProps) {
  const ActionElement = () => {
    if (!actionLabel) return null;
    if (href) {
      return (
        <a href={href} className="mt-4 inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">
          {actionLabel}
        </a>
      );
    }
    return (
      <button
        type="button"
        onClick={onAction}
        className="mt-4 inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white"
      >
        {actionLabel}
      </button>
    );
  };

  return (
    <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white/60 p-8 text-center shadow-sm">
      <p className="text-lg font-semibold text-slate-900">{title}</p>
      {description && <p className="mt-2 text-sm text-slate-600">{description}</p>}
      <ActionElement />
    </div>
  );
}
