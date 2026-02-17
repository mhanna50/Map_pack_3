"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Hero } from "@/sections/Hero";

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
                    <span>Real support from real people</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 text-center mt-20" style={parallax(0.4)}>
            <p className="text-xs uppercase tracking-[0.3em] text-sky-300">Product flow</p>
            <h2 className="text-3xl font-semibold text-white md:text-4xl">How Map Pack 3 compounds results.</h2>
          </div>

          <div className="flex -mt-12 items-start justify-center">
            <Image
              src="/flow.svg"
              alt="Product flow for Map Pack 3"
              className="relative mx-auto h-auto w-full max-w-5xl"
              width={667}
              height={667}
              priority
            />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="relative border-t border-white/5 bg-[#060712] px-6 py-18">
        <div className="mx-auto max-w-6xl space-y-6 text-center">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-sky-300">How Map Pack Works</p>
            <h3 className="text-3xl font-semibold text-white md:text-4xl">We automate the motions that move local visibility.</h3>
            <p className="text-sm text-slate-300">A clear pipeline from reputation and posting to measurable lift in calls and actions.</p>
          </div>
          <div className="relative">
            <div className="grid gap-4 md:grid-cols-3 md:gap-6">
              {[
                {
                  title: "Reputation Management",
                  body: [
                    "Protect and grow your reputation without manual follow-ups.",
                    "Automatic SMS review requests, real-time monitoring, and alerts keep trust high.",
                  ],
                },
                {
                  title: "GBP Posting Automation",
                  body: [
                    "Publish service updates, seasonal content, and highlights on a smart schedule.",
                    "Stay fresh and competitive on Google without posting manually.",
                  ],
                },
                {
                  title: "Performance & Rank Tracking Insights",
                  body: [
                    "See views, calls, direction requests, and local ranking trends over time.",
                    "Understand what’s driving visibility and growth—no jargon or spreadsheets.",
                  ],
                },
              ].map((card, idx) => (
                <div key={card.title} className="flex flex-col items-stretch">
                  <div
                    className="relative flex h-full flex-1 flex-col rounded-xl border border-white/60 px-5 py-5 text-left"
                    style={{ color: "#EAEAEA" }}
                  >
                    <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-2 rounded-full border border-white/50 bg-[#060712] px-2 text-[10px] font-semibold tracking-wide md:hidden">
                      {idx + 1}
                    </span>
                    <h4 className="text-base font-semibold text-white">{card.title}</h4>
                    <ul className="mt-2 space-y-1 text-sm leading-relaxed">
                      {card.body.map((line) => (
                        <li key={line} className="text-[#EAEAEA]">
                          • {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
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
            <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">Simple, all-in pricing.</h2>
            <p className="mt-2 text-slate-300">Everything you need to dominate local search, one flat price.</p>
          </div>
          <div className="mx-auto max-w-4xl">
            <div
              className={cn(
                "group relative overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-br from-[#0b0f1a] via-[#0b1224] to-[#0a1020] p-8 shadow-[0_40px_120px_rgba(0,0,0,0.45)] transition duration-300 hover:-translate-y-1",
              )}
              style={repel(8)}
            >
              <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(90% 90% at 50% 10%, rgba(56,189,248,0.18), transparent)" }} />
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:px-4">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-300">Everything Included</p>
                      <h3 className="mt-2 text-4xl font-semibold text-white">$299 / month</h3>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-slate-300">No contracts • No setup fees • Cancel anytime</p>
                  <div className="flex flex-wrap gap-3">
                    <a
                      href="/checkout?plan=all-in"
                      className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:from-sky-400 hover:to-indigo-500"
                    >
                      Get Started
                    </a>
                    <a
                      href="#contact"
                      className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-sky-400/60"
                    >
                      Talk to sales
                    </a>
                  </div>
                </div>
                <ul className="grid w-full gap-3 rounded-2xl border border-white/10 p-4 text-sm text-slate-200 md:mt-1 md:w-auto md:self-start md:ml-auto">
                  {[
                    "Automated Google Business Profile posting",
                    "Reputation management system",
                    "Local visibility and rank tracking",
                    "Local directory consistency monitoring tool",
                    "Personal monitoring dashboard",
                  ].map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-sky-400" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
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

      {/* CLIENT LOGIN + READY */}
      <section className="border-t border-white/5 bg-[#05060c] px-6 py-18">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-lg shadow-black/40">
            <div className="grid min-h-[260px] gap-6 md:grid-cols-[1fr,220px] md:items-stretch">
              <div className="flex flex-col justify-between gap-4 text-left">
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-sky-300">Client Login</p>
                  <h2 className="text-3xl font-semibold text-white">Access your dashboard to manage your local visibility.</h2>
                </div>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:from-sky-400 hover:to-indigo-500"
                >
                  Log In
                </Link>
              </div>
              <div className="flex flex-col justify-between gap-3 text-left">
                <div className="text-sm font-semibold text-slate-200">Need help signing in?</div>
                <a href="/support" className="text-sm font-semibold text-slate-200 hover:text-white">
                  Contact support
                </a>
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-800/30 via-slate-900 to-sky-900/30 px-8 py-12 text-center shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
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
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 bg-[#04050c] px-6 py-12">
        <div className="mx-auto flex max-w-6xl justify-center">
          <div className="grid w-full gap-8 md:grid-cols-[1.2fr_1fr_1fr] justify-items-start">
          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-white">Map Pack 3</h3>
            <p className="text-sm text-slate-300">
              Purpose-built to automate Google Business Profiles, reputation, and local visibility—without adding headcount.
            </p>
            <p className="text-sm text-slate-400">
              214 Market Street, Suite 200<br />
              San Francisco, CA 94103<br />
              support@mappack3.com
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-300">Pages</h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-200">
              <li><a className="hover:text-white" href="#product">Product</a></li>
              <li><a className="hover:text-white" href="#pricing">Pricing</a></li>
              <li><a className="hover:text-white" href="/login">Client Login</a></li>
              <li><a className="hover:text-white" href="#contact">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-300">Company</h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-200">
              <li><a className="hover:text-white" href="/about">About</a></li>
              <li><a className="hover:text-white" href="/privacy">Privacy</a></li>
              <li><a className="hover:text-white" href="/terms">Terms</a></li>
              <li><a className="hover:text-white" href="/support">Support</a></li>
            </ul>
          </div>
        </div>
        </div>
        <div className="mx-auto mt-8 max-w-6xl border-t border-white/5 pt-4 text-left text-xs text-slate-500">
          © {new Date().getFullYear()} Map Pack 3. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
