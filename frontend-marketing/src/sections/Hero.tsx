"use client";

import { Header } from "@/components/Header";
import { TypewriterText } from "@/components/TypewriterText";

export function Hero() {
  return (
    <div className="relative min-h-screen bg-[#05060f] text-white" aria-label="Hero">
      <Header show />

      <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-6 pb-12 pt-32 text-center">
        <div className="flex flex-col items-center gap-3">
          <TypewriterText
            text={"Welcome to\nMap Pack 3."}
            className="whitespace-pre-line text-5xl font-semibold leading-tight md:text-6xl lg:text-7xl"
            speed={51}
          />
          <TypewriterText
            text={"Your all-in-one Google Business Profile and review command center."}
            className="max-w-3xl whitespace-pre-line text-lg text-slate-200 md:text-xl"
            speed={40}
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <a
            href="/pricing"
            className="rounded-full border border-white/30 px-6 py-3 text-base font-medium text-white transition hover:border-white hover:bg-white/10"
          >
            View pricing
          </a>
          <a
            href="#contact"
            className="rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:from-sky-400 hover:to-indigo-500"
          >
            Book a demo
          </a>
        </div>

        <div className="relative z-0 w-full max-w-5xl -mb-36 mt-10">
          <div className="relative flex h-[620px] w-full items-end justify-center overflow-hidden rounded-2xl border border-white/25 bg-[#0b0d1a] shadow-[0_0_42px_12px_rgba(255,255,255,0.28)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(59,130,246,0.42),rgba(5,6,15,0)_55%)]" />
            <div className="pointer-events-none absolute inset-0 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_50px_18px_rgba(255,255,255,0.18)]" />

            <div className="relative aspect-[16/9] w-[92%] max-w-full grid place-items-center text-center text-sm font-semibold uppercase tracking-[0.16em] text-slate-200/80">
              Client dashboard placeholder
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
