const checklist = [
  { label: "Connect Google Business Profile", done: true },
  { label: "Choose service areas", done: true },
  { label: "Select services", done: false },
  { label: "Upload 10+ photos", done: false },
  { label: "Set brand voice", done: true },
  { label: "Review approval rules", done: false },
];

const notifications = [
  { label: "Negative reviews", channels: ["Email", "SMS"] },
  { label: "Rank changes", channels: ["Email"] },
  { label: "Photo requests", channels: ["Email"] },
  { label: "Weekly summary", channels: ["Email"] },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Settings & guardrails</p>
        <h1 className="text-2xl font-semibold">Stay in control but offload the busywork</h1>
        <p className="text-sm text-slate-600">Onboarding checklist + approvals + notifications from one place.</p>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Onboarding checklist</h3>
          <ul className="mt-4 space-y-3">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full ${
                    item.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {item.done ? "✓" : "•"}
                </span>
                <span className="text-sm text-slate-700">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Brand voice</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>Tone: Friendly & confident</li>
            <li>Do say: local, fast, trusted</li>
            <li>Don’t say: cheapest, discount</li>
            <li>Signature: “- The Acme HVAC team”</li>
          </ul>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Approval rules</h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            <li>Auto-post positive review replies ✅</li>
            <li>Flag negative reviews ❗</li>
            <li>Auto-post weekly update ✅</li>
            <li>Attribute edits require approval ❗</li>
          </ul>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Notifications</h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            {notifications.map((item) => (
              <li key={item.label} className="flex items-center justify-between">
                <span>{item.label}</span>
                <span className="text-xs text-slate-500">{item.channels.join(", ")}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
