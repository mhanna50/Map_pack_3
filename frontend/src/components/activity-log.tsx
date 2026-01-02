type ActivityEntry = {
  id: string;
  title: string;
  description: string;
  timestamp: string;
};

type ActivityLogProps = {
  entries: ActivityEntry[];
};

export function ActivityLog({ entries }: ActivityLogProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-3xl bg-white p-6 text-sm text-slate-500 shadow-sm">
        Nothing on the books yet. Actions will show up here as automations run.
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Activity</p>
        <h3 className="text-lg font-semibold text-slate-900">Latest actions</h3>
      </div>
      <ul className="space-y-4">
        {entries.map((entry, index) => (
          <li key={entry.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
              {index !== entries.length - 1 && <span className="mt-1 h-full w-px bg-slate-100" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{entry.title}</p>
              <p className="text-sm text-slate-600">{entry.description}</p>
              <p className="text-xs text-slate-400">{entry.timestamp}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
