import { StatusBadge } from "@/components/status-badge";

const qnaEntries = [
  { id: 1, question: "Do you offer emergency HVAC repairs?", status: "Scheduled", postDate: "Aug 14", dedupe: false },
  { id: 2, question: "What areas do you serve?", status: "Posted", postDate: "Aug 5", dedupe: true },
];

export default function QnaPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Q&A</h1>
          <p className="text-sm text-slate-600">Manage Google Business Profile Q&A entries.</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Generate batch</button>
          <button className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">Schedule Q&A</button>
        </div>
      </header>
      <div className="space-y-4">
        {qnaEntries.map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{entry.question}</h3>
              <StatusBadge status={entry.status} />
            </div>
            {entry.dedupe && <p className="text-xs font-semibold text-amber-600">Similar Q already exists</p>}
            <p className="mt-2 text-sm text-slate-500">Posting {entry.postDate}</p>
            <div className="mt-3 flex gap-2 text-xs font-semibold">
              <button className="rounded-full border border-slate-200 px-4 py-2 text-slate-600">Approve</button>
              <button className="rounded-full border border-slate-200 px-4 py-2 text-slate-600">Edit</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
