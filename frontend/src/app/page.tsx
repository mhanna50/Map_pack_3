import Link from "next/link";

const steps = [
  { title: "Connect Google", description: "Securely authorize your Google Business Profile in under two minutes." },
  { title: "Choose locations & schedule", description: "Select the locations to automate and pick your ideal publishing cadence." },
  { title: "Approve safety items", description: "Review negative replies and sensitive edits from one queue before they go live." },
  { title: "Automations run weekly", description: "Posts, reviews, Q&A, and reminders keep rolling without manual effort." },
];

const features = [
  { title: "Posting Automation", description: "Fresh GBP updates rotating offers, events, and service spotlights automatically." },
  { title: "Review Reply Automation", description: "AI-drafted responses + approvals so every review gets acknowledged fast." },
  { title: "Q&A Automation", description: "Answer common questions before prospects even ask, boosting conversion." },
  { title: "Review Request Automation", description: "Trigger SMS/email requests after each job to keep the review flywheel spinning." },
  { title: "Rank Tracking + Alerts", description: "Geo-grid rank snapshots with alerts when visibility dips or spikes." },
  { title: "Photo Management", description: "Reminders + uploads ensure new media hits your listing when it matters." },
];

const pricing = [
  { name: "Starter", price: "$49", description: "Per location / month. Essentials for single-location businesses.", includes: ["1 location", "Core automations", "Email support"] },
  { name: "Pro", price: "$99", description: "Per location / month. Multi-location agencies that need approvals.", includes: ["Up to 10 locations", "Approval workflows", "Slack/Email alerts"] },
  { name: "Agency", price: "Custom", description: "High-volume programs with dedicated success + custom limits.", includes: ["Unlimited locations", "Custom usage limits", "Dedicated support"] },
];

export default function Home() {
  return (
    <div className="bg-white text-slate-900">
      <div className="border-b border-slate-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 text-sm font-semibold text-slate-700">
          <Link href="/">Map Pack 3</Link>
          <nav className="flex items-center gap-4">
            <a href="#how-it-works" className="hover:text-primary">
              How it works
            </a>
            <a href="#features" className="hover:text-primary">
              Features
            </a>
            <a href="#pricing" className="hover:text-primary">
              Pricing
            </a>
            <a href="#contact" className="hover:text-primary">
              Contact
            </a>
            <a href="#contact" className="rounded-full bg-primary px-4 py-2 text-white">
              Schedule a call
            </a>
          </nav>
        </div>
      </div>
      <header className="mx-auto flex max-w-6xl flex-col gap-16 px-6 pb-24 pt-20 sm:flex-row sm:items-center sm:pb-32 sm:pt-24">
        <div className="flex-1 space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">Automate GBP</p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            Automate your Google Business Profile to get more calls.
          </h1>
          <p className="text-lg text-slate-600">
            Map Pack 3 keeps posts, reviews, Q&A, rankings, and photos fresh so you never fall behind local competitors.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="#contact"
              className="rounded-full bg-primary px-6 py-3 text-white transition hover:bg-primary/90"
            >
              Schedule a call
            </a>
          </div>
          <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            <p className="font-medium text-slate-700">Case study coming soon</p>
            <p>Join 50+ locations already publishing weekly without lifting a finger.</p>
          </div>
        </div>
        <div className="flex-1 space-y-8 rounded-2xl bg-slate-50 p-8 shadow-sm">
          <h2 className="text-xl font-semibold">3 core outcomes</h2>
          <div className="space-y-4">
            {["More activity across posts and photos", "Faster review replies (hours, not days)", "Improved local visibility & rank stability"].map(
              (item) => (
                <div key={item} className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm">
                  {item}
                </div>
              ),
            )}
          </div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Trusted by agencies & multi-location brands</p>
        </div>
      </header>

      <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-semibold">How it works</h3>
            <p className="text-slate-600">Four simple steps to put growth on autopilot.</p>
          </div>
          <a href="#contact" className="text-sm font-medium text-primary underline underline-offset-4">
            Book a call
          </a>
        </div>
        <div className="grid gap-6 md:grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Step {index + 1}</span>
              <h4 className="mt-3 text-lg font-semibold">{step.title}</h4>
              <p className="mt-2 text-sm text-slate-600">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10">
          <h3 className="text-2xl font-semibold">Automations built for outcomes</h3>
          <p className="text-slate-600">Every feature ladders up to more calls, reviews, and rankings.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <h4 className="text-lg font-semibold">{feature.title}</h4>
              <p className="mt-2 text-sm text-slate-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-10 text-center">
          <h3 className="text-2xl font-semibold">Pricing</h3>
          <p className="text-slate-600">Per location / per month. Scale up when you’re ready.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {pricing.map((tier) => (
            <div key={tier.name} className="flex flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <div>
                <h4 className="text-xl font-semibold">{tier.name}</h4>
                <p className="mt-1 text-3xl font-bold text-slate-900">{tier.price}</p>
                <p className="mt-2 text-sm text-slate-600">{tier.description}</p>
              </div>
              <ul className="my-6 space-y-2 text-sm text-slate-700">
                {tier.includes.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href="#contact"
                className="mt-auto rounded-full bg-primary px-4 py-2 text-center text-sm font-semibold text-white"
              >
                Talk to sales
              </a>
            </div>
          ))}
        </div>
      </section>

      <section id="contact" className="mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-3xl bg-slate-900 px-6 py-10 text-white md:px-12 md:py-14">
          <div className="space-y-4">
            <p className="text-sm uppercase tracking-[0.3em] text-primary">Talk to us</p>
            <h3 className="text-2xl font-semibold">Book a demo or reach out</h3>
            <p className="text-sm text-slate-200">Share a few details below and we’ll send a calendar link.</p>
          </div>
          <form className="mt-8 grid gap-4 md:grid-cols-2">
            <input
              type="text"
              placeholder="Name"
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-slate-200 focus:border-white focus:outline-none md:col-span-1"
            />
            <input
              type="email"
              placeholder="Email"
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-slate-200 focus:border-white focus:outline-none md:col-span-1"
            />
            <textarea
              placeholder="Tell us about your locations"
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-slate-200 focus:border-white focus:outline-none md:col-span-2"
              rows={3}
            />
            <button
              type="button"
              className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white md:col-span-2"
            >
              Request demo
            </button>
          </form>
          <p className="mt-6 text-sm text-slate-200">
            Prefer to pick a time?{" "}
            <a
              href="https://calendly.com"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-white underline"
            >
              Book via Calendly
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
