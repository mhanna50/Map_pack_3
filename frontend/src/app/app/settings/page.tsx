const sections = [
  {
    title: "Business info",
    fields: ["Acme HVAC", "Services: Install, Repair", "Areas: Downtown, Uptown"],
  },
  {
    title: "Brand voice",
    fields: ["Tone: Friendly", "Do say: fast, local", "Don't say: cheapest"],
  },
  {
    title: "Automations",
    fields: ["Posts: On", "Reviews: On (>=4 auto)", "Q&A: Draft", "Review requests: On"],
  },
  {
    title: "Posting schedule",
    fields: ["Mon / Wed / Fri", "Time window: 9a-4p"],
  },
  {
    title: "Approval rules",
    fields: ["Negative reviews", "Offers", "GBP edits"],
  },
  {
    title: "Notifications",
    fields: ["Email: ops@acme.com", "SMS: (555) 123-4567"],
  },
  {
    title: "Users & roles",
    fields: ["Jane – Owner", "Luis – Admin", "Nina – Member"],
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-600">Control brand, automations, and users.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <div key={section.title} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <button className="text-xs font-semibold text-primary">Edit</button>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {section.fields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
