import Link from "next/link";
import { Hero } from "@/components/Hero";

const checkoutBaseUrl = process.env.CLIENT_APP_URL ?? "";

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
  {
    name: "Starter",
    plan: "starter",
    price: "$49",
    description: "Per location / month. Essentials for single-location businesses.",
    includes: ["1 location", "Core automations", "Email support"],
    cta: "Start checkout",
    href: `${checkoutBaseUrl}/checkout?plan=starter`,
  },
  {
    name: "Pro",
    plan: "pro",
    price: "$99",
    description: "Per location / month. Multi-location agencies that need approvals.",
    includes: ["Up to 10 locations", "Approval workflows", "Slack/Email alerts"],
    cta: "Start checkout",
    href: `${checkoutBaseUrl}/checkout?plan=pro`,
  },
  {
    name: "Agency",
    plan: "agency",
    price: "Custom",
    description: "High-volume programs with dedicated success + custom limits.",
    includes: ["Unlimited locations", "Custom usage limits", "Dedicated support"],
    cta: "Talk to sales",
    href: "#contact",
  },
];

export default function Home() {
  return (
    <div className="bg-background text-foreground">
      <div className="border-b border-white/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 text-sm font-semibold text-slate-200">
          <Link href="/">Map Pack 3</Link>
          <nav className="flex items-center gap-4">
            <a href="#how-it-works" className="transition hover:text-accent">
              How it works
            </a>
            <a href="#features" className="transition hover:text-accent">
              Features
            </a>
            <a href="#pricing" className="transition hover:text-accent">
              Pricing
            </a>
            <a href="#contact" className="transition hover:text-accent">
              Contact
            </a>
            <Link
              href="/login"
              className="rounded-full bg-primary px-4 py-2 text-white transition hover:bg-primary/90"
            >
              Client login
            </Link>
          </nav>
        </div>
      </div>
      <Hero />

      <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-semibold text-white">How it works</h3>
            <p className="text-slate-300">Four simple steps to put growth on autopilot.</p>
          </div>
          <a href="#contact" className="text-sm font-medium text-accent underline underline-offset-4">
            Book a call
          </a>
        </div>
        <div className="grid gap-6 md:grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.title} className="rounded-2xl border border-white/10 bg-card p-5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Step {index + 1}</span>
              <h4 className="mt-3 text-lg font-semibold text-white">{step.title}</h4>
              <p className="mt-2 text-sm text-slate-300">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10">
          <h3 className="text-2xl font-semibold text-white">Automations built for outcomes</h3>
          <p className="text-slate-300">Every feature ladders up to more calls, reviews, and rankings.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-2xl border border-white/10 bg-card p-6 shadow-sm shadow-blue-500/10">
              <h4 className="text-lg font-semibold text-white">{feature.title}</h4>
              <p className="mt-2 text-sm text-slate-300">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-10 text-center">
          <h3 className="text-2xl font-semibold text-white">Pricing</h3>
          <p className="text-slate-300">Per location / per month. Scale up when you’re ready.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {pricing.map((tier) => (
            <div key={tier.name} className="flex flex-col rounded-2xl border border-white/10 bg-card p-6 shadow-sm shadow-blue-500/10">
              <div>
                <h4 className="text-xl font-semibold text-white">{tier.name}</h4>
                <p className="mt-1 text-3xl font-bold text-white">{tier.price}</p>
                <p className="mt-2 text-sm text-slate-300">{tier.description}</p>
              </div>
              <ul className="my-6 space-y-2 text-sm text-slate-200">
                {tier.includes.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href={tier.href}
                className="mt-auto rounded-full bg-secondary px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-secondary/90"
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>
      </section>

      <section id="contact" className="mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-3xl border border-white/10 bg-card px-6 py-10 text-white md:px-12 md:py-14">
          <div className="space-y-4">
            <p className="text-sm uppercase tracking-[0.3em] text-accent">Talk to us</p>
            <h3 className="text-2xl font-semibold">Book a demo or reach out</h3>
            <p className="text-sm text-slate-200">Share a few details below and we’ll send a calendar link.</p>
          </div>
          <form className="mt-8 grid gap-4 md:grid-cols-2">
            <input
              type="text"
              placeholder="Name"
              className="rounded-2xl border border-white/10 bg-background/40 px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-accent focus:outline-none md:col-span-1"
            />
            <input
              type="email"
              placeholder="Email"
              className="rounded-2xl border border-white/10 bg-background/40 px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-accent focus:outline-none md:col-span-1"
            />
            <textarea
              placeholder="Tell us about your locations"
              className="rounded-2xl border border-white/10 bg-background/40 px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-accent focus:outline-none md:col-span-2"
              rows={3}
            />
            <button
              type="button"
              className="rounded-full bg-secondary px-6 py-3 text-sm font-semibold text-white transition hover:bg-secondary/90 md:col-span-2"
            >
              Request demo
            </button>
          </form>
          <p className="mt-6 text-sm text-slate-300">
            Prefer to pick a time?{" "}
            <a
              href="https://calendly.com"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-accent underline"
            >
              Book via Calendly
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
