import type { ReactNode } from "react";
import { AlertTriangle, Check, ClipboardList, PhoneCall } from "lucide-react";

import { cn } from "@/lib/utils";

export function PlainEnglishBox({
  title = "In plain English",
  body,
  className,
}: {
  title?: string;
  body: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-6 shadow-[0_10px_30px_rgba(55,48,40,0.06)]",
        "before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-[linear-gradient(90deg,#B86B4B,#E6C98F,#7A8463)]",
        className,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B86B4B]">{title}</p>
      <p className="mt-3 text-base leading-7 text-[#5F6673]">{body}</p>
    </div>
  );
}

export function FounderNote({
  children,
  title = "Founder note",
  className,
}: {
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[#D8CFC1] bg-[#F8F3EA] p-6 shadow-[6px_6px_0_rgba(138,75,49,0.12)]",
        className,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B86B4B]">{title}</p>
      <div className="mt-3 text-base leading-7 text-[#5F6673]">{children}</div>
    </div>
  );
}

export function LocalBusinessExample({
  example,
  title = "What this looks like in real life",
  className,
}: {
  example: string;
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-[#D8CFC1] bg-[#F8F3EA] p-6", className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B86B4B]">{title}</p>
      <p className="mt-3 text-lg font-semibold leading-8 text-[#14213D]">{example}</p>
    </div>
  );
}

export function CommonMistakes({
  items,
  title = "Common mistakes",
  className,
}: {
  items: string[];
  title?: string;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-6", className)}>
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#B86B4B] text-[#F8F3EA]">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="text-2xl font-semibold text-[#14213D]">{title}</h2>
      </div>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-[#5F6673]">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#B86B4B]" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RetroChecklist({
  title,
  items,
  className,
}: {
  title: string;
  items: string[];
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-6", className)}>
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#14213D] text-[#F8F3EA]">
          <ClipboardList className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="text-2xl font-semibold text-[#14213D]">{title}</h2>
      </div>
      <ul className="mt-5 grid gap-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-[#5F6673]">
            <Check className="mt-1 h-4 w-4 shrink-0 text-[#7A8463]" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BeforeAfterPanel({
  beforeTitle = "Before",
  afterTitle = "After",
  beforeItems,
  afterItems,
  className,
}: {
  beforeTitle?: string;
  afterTitle?: string;
  beforeItems: string[];
  afterItems: string[];
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-[#D8CFC1] bg-[#FFFDF8]", className)}>
      <div className="grid md:grid-cols-2">
        <div className="border-b border-[#D8CFC1] bg-[#F8F3EA] p-6 md:border-b-0 md:border-r">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B86B4B]">{beforeTitle}</p>
          <ul className="mt-4 space-y-3">
            {beforeItems.map((item) => (
              <li key={item} className="text-sm leading-6 text-[#5F6673]">
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7A8463]">{afterTitle}</p>
          <ul className="mt-4 space-y-3">
            {afterItems.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-6 text-[#14213D]">
                <Check className="mt-1 h-4 w-4 shrink-0 text-[#7A8463]" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function DashboardPreviewCard({ className }: { className?: string }) {
  const metrics = [
    { label: "Profile fixes", value: "8", note: "ready to review" },
    { label: "Reviews", value: "+12", note: "this month" },
    { label: "Listings", value: "4", note: "need cleanup" },
    { label: "Leads", value: "3", note: "missed calls" },
  ];

  return (
    <div
      className={cn(
        "rounded-lg border border-[#D8CFC1] bg-[#14213D] p-3 shadow-[0_28px_80px_rgba(52,45,36,0.2)]",
        className,
      )}
    >
      <div className="rounded-md border border-white/10 bg-[#14213D] p-4 text-[#F8F3EA]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E6C98F]">
              Local visibility board
            </p>
            <p className="mt-1 text-2xl font-semibold">Today&apos;s owner view</p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-[#F8F3EA]/10 px-3 py-2 text-sm text-[#D8CFC1]">
            <PhoneCall className="h-4 w-4 text-[#E6C98F]" aria-hidden="true" />
            Missed leads need follow-up
          </div>
        </div>
        <div className="grid gap-3 py-4 md:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-md border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[#D8CFC1]">{metric.label}</p>
              <p className="mt-3 text-3xl font-semibold">{metric.value}</p>
              <p className="mt-1 text-xs text-[#D8CFC1]">{metric.note}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-md border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-semibold text-[#F8F3EA]">Next practical actions</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[#D8CFC1]">
              <li>Draft a seasonal service post for two nearby towns.</li>
              <li>Ask the field team for recent project photos.</li>
              <li>Review citation mismatches before cleanup.</li>
            </ul>
          </div>
          <div className="rounded-md border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-semibold text-[#F8F3EA]">Owner summary</p>
            <p className="mt-3 text-sm leading-6 text-[#D8CFC1]">
              Visibility gets you found. Reviews and photos help people trust you. Lead recovery helps you
              avoid wasting the attention you earned.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
