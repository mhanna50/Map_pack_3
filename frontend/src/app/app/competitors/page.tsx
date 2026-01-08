const competitors = [
  { name: "Pro HVAC", reviews: 214, posts: "Weekly", rating: "4.8 ★", gap: "Push offers" },
  { name: "Rapid Plumb", reviews: 143, posts: "Monthly", rating: "4.4 ★", gap: "Add emergency posts" },
  { name: "Comfort Crew", reviews: 176, posts: "Dormant", rating: "4.1 ★", gap: "You’re winning on activity" },
];

export default function CompetitorsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Competitive insights</p>
        <h1 className="text-2xl font-semibold">See how the neighbors stack up</h1>
        <p className="text-sm text-slate-600">We watch their review volume, posting frequency, and keyword coverage so you can stay ahead.</p>
      </header>

      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Competitor set</h2>
          <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Edit list</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {competitors.map((competitor) => (
            <div key={competitor.name} className="rounded-2xl border border-slate-100 p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">{competitor.name}</p>
              <p className="text-xs text-slate-500">{competitor.rating}</p>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                <li>Reviews: {competitor.reviews}</li>
                <li>Posts: {competitor.posts}</li>
                <li>Gap: {competitor.gap}</li>
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
