"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Lock, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Hero } from "@/sections/Hero";
import { FlowChart } from "@/components/FlowChart";

type Plan = {
  name: string;
  price: string;
  description: string;
  highlights: string[];
  cta: string;
  href: string;
  popular?: boolean;
};

const plans: Plan[] = [
  {
    name: "Starter",
    price: "$49",
    description: "Single-location automation with essentials.",
    highlights: ["1 location", "Posting + review automation", "Email support"],
    cta: "Start",
    href: "/checkout?plan=starter",
  },
  {
    name: "Pro",
    price: "$99",
    description: "Multi-location control, approvals, and alerts.",
    highlights: ["Up to 10 locations", "Approval queue & alerts", "Slack/Email notifications"],
    cta: "Get Pro",
    href: "/checkout?plan=pro",
    popular: true,
  },
  {
    name: "Agency",
    price: "Talk to us",
    description: "Custom limits, SSO, and dedicated support.",
    highlights: ["Unlimited locations", "Custom cadences", "Dedicated success"],
    cta: "Talk to sales",
    href: "#contact",
  },
];

const testimonials = [
  { quote: "We turned GBP into a reliable channel without adding headcount.", name: "Jordan K.", role: "COO, Home Services" },
  { quote: "Approvals + automations in one place. The team finally stopped chasing posts.", name: "Priya D.", role: "VP Marketing, Multi-location Retail" },
  { quote: "Rank + reviews improved in 60 days. Support is instant.", name: "Michael L.", role: "Agency Owner" },
];

export default function Home() {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const { innerWidth, innerHeight } = window;
      setMouse({
        x: (e.clientX / innerWidth - 0.5) * 2,
        y: (e.clientY / innerHeight - 0.5) * 2,
      });
    };
    window.addEventListener("pointermove", handler, { passive: true });
    return () => window.removeEventListener("pointermove", handler);
  }, []);

  const parallax = (depth: number) => ({
    transform: `translate3d(${mouse.x * depth}rem, ${mouse.y * depth}rem, 0)`,
  });

  const repel = (depth = 4) => ({
    transform: `translate3d(${mouse.x * depth}px, ${mouse.y * depth}px,0)`,
  });

  const gradientPos = useMemo(() => `${50 + mouse.x * 6}% ${50 + mouse.y * 6}%`, [mouse]);

  return (
    <div className="min-h-screen bg-[#05060c] text-white">
      <Hero />

      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 15%, rgba(37,99,235,0.12), transparent), radial-gradient(80% 60% at 20% 20%, rgba(56,189,248,0.15), transparent), radial-gradient(120% 120% at 80% 10%, rgba(30,64,175,0.25), transparent)",
          backgroundPosition: gradientPos,
          transition: "background-position 120ms ease-out",
        }}
      />

      {/* PRODUCT -> FLOW */}
      <section id="product" className="relative overflow-visible border-t border-white/5 bg-[#070910] px-6 py-18">
        <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(90% 70% at 50% 8%, rgba(56,189,248,0.18), transparent)" }} />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-10">
          <div className="relative z-50 mx-auto w-[80%] max-w-4xl -mt-16 md:-mt-24">
            <div className="flex flex-col gap-4 rounded-2xl border border-white/15 bg-white/6 px-5 py-5 text-left text-slate-100 backdrop-blur">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white">Why businesses trust us</p>
              <div className="grid gap-4 text-sm font-medium text-slate-200">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-block h-2.5 w-2.5 rounded-full bg-sky-300" />
                    <span>No contracts — cancel any time</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-block h-2.5 w-2.5 rounded-full bg-sky-300" />
                    <span>Set up in under 10 minutes</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-block h-2.5 w-2.5 rounded-full bg-sky-300" />
                    <span>Built to boost local visibility</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-block h-2.5 w-2.5 rounded-full bg-sky-300" />
                    <span>Real support from real humans, responsive and invested in your outcomes</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-block h-2.5 w-2.5 rounded-full bg-sky-300" />
                    <span>We keep your data secure with disciplined controls and best‑practice safeguards</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 text-center mt-20" style={parallax(0.4)}>
            <p className="text-xs uppercase tracking-[0.3em] text-sky-300">Product flow</p>
            <h2 className="text-3xl font-semibold text-white md:text-4xl">How Map Pack 3 compounds results.</h2>
            <p className="text-lg text-slate-300">
              A live flowchart shows the path from automations to outcomes—built directly on your Google Business Profile motion.
            </p>
          </div>

          <div className="flex -mt-12 items-start justify-center">
            <FlowChart />
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="relative overflow-hidden border-t border-white/5 bg-[#04060d] px-6 py-18">
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage: "radial-gradient(90% 70% at 50% 10%, rgba(30,64,175,0.22), transparent)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "100% 100%",
            backgroundPosition: gradientPos,
          }}
        />
        <div className="relative mx-auto max-w-5xl space-y-8">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-sky-300">Pricing</p>
            <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">Transparent plans built for scale.</h2>
            <p className="mt-2 text-slate-300">Per-location pricing with automation limits you control.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "group flex flex-col rounded-2xl border border-white/10 bg-gradient-to-br from-[#0b0f1a] to-[#0b1224] p-6 shadow-lg shadow-black/40 transition duration-300",
                  plan.popular && "border-sky-400/60 shadow-sky-900/50",
                  "hover:-translate-y-1",
                )}
                style={repel(plan.popular ? 12 : 6)}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
                  {plan.popular && (
                    <span className="rounded-full bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-100">Most popular</span>
                  )}
                </div>
                <p className="mt-2 text-3xl font-bold text-white">{plan.price}</p>
                <p className="mt-1 text-sm text-slate-400">{plan.description}</p>
                <ul className="mt-6 space-y-2 text-sm text-slate-200">
                  {plan.highlights.map((h) => (
                    <li key={h} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-sky-400" />
                      {h}
                    </li>
                  ))}
                </ul>
                <a
                  href={plan.href}
                  className={cn(
                    "mt-auto inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition",
                    plan.popular
                      ? "border-sky-400/70 bg-sky-500/20 text-white hover:bg-sky-500/30"
                      : "border-white/10 bg-white/5 text-white hover:border-sky-400/60",
                  )}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section id="trust" className="border-t border-white/5 bg-[#05060c] px-6 py-18">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-sky-300">Social proof</p>
              <h2 className="mt-3 text-3xl font-semibold text-white">Trusted by operators who need results.</h2>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <Lock className="h-4 w-4 text-sky-300" />
              Secure by design
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {testimonials.map((item, idx) => (
              <div
                key={item.name}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c111f] to-[#0a0f1a] p-5 shadow-lg shadow-black/30"
                style={repel((idx - 1) * 4)}
              >
                <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100" style={{ background: "radial-gradient(60% 60% at 50% 30%, rgba(56,189,248,0.12), transparent)" }} />
                <p className="relative text-sm text-slate-200">{item.quote}</p>
                <div className="relative mt-4 text-xs text-slate-400">
                  <p className="font-semibold text-white">{item.name}</p>
                  <p>{item.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* LOGIN / ACCOUNT ACCESS */}
      <section className="border-t border-white/5 bg-[#060712] px-6 py-18">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2">
          <div className="space-y-4" style={parallax(0.6)}>
            <p className="text-xs uppercase tracking-[0.3em] text-sky-300">Account access</p>
            <h2 className="text-3xl font-semibold text-white">Clients jump in instantly.</h2>
            <p className="text-lg text-slate-300">
              Login stays intact. We simply make it feel premium. The panel reveals itself as you approach.
            </p>
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <Clock3 className="h-4 w-4 text-sky-300" />
              SSO-ready · Magic link friendly
            </div>
          </div>
          <div
            className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0c1224] to-[#0b142b] p-8 shadow-xl shadow-black/50 transition duration-500 hover:-translate-y-1"
            style={parallax(-0.4)}
          >
            <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(70% 70% at 30% 20%, rgba(56,189,248,0.18), transparent)" }} />
            <div className="relative space-y-4">
              <h3 className="text-2xl font-semibold text-white">Login</h3>
              <p className="text-sm text-slate-300">Existing customers continue below. Admins are routed automatically.</p>
              <Link
                href="/login"
                className="group inline-flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-sky-400/60 hover:bg-white/10"
              >
                Go to login
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <div className="rounded-2xl border border-white/5 bg-black/30 px-4 py-3 text-xs text-slate-300">
                Tip: If you’re an admin, we’ll take you to the admin dashboard automatically after sign-in.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-white/5 bg-[#05060c] px-6 py-18">
        <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-800/30 via-slate-900 to-sky-900/30 px-8 py-12 text-center shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
          <p className="text-xs uppercase tracking-[0.3em] text-sky-200">Ready</p>
          <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">Automate your GBP playbook in days, not months.</h2>
          <p className="mt-3 text-lg text-slate-300">Keep the guardrails, lose the busywork. Posts, reviews, and rank all in one motion.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="#pricing"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-900/40 transition hover:from-indigo-500 hover:to-sky-400"
            >
              View plans
            </a>
            <a href="#contact" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-100 hover:border-sky-400/60">
              Talk to sales
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
