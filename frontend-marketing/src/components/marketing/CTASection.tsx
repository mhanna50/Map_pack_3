import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function CTASection({
  title = "Ready to make local visibility easier to manage?",
  description = "Tell us where your business is today. We will help you understand what to improve first.",
  primaryHref = "/contact",
  primaryLabel = "Book a demo",
  secondaryHref = "/platform",
  secondaryLabel = "See the platform",
}: {
  title?: string;
  description?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-lg border border-[#D8CFC1] bg-[#14213D] px-6 py-10 text-[#F8F3EA] shadow-[0_24px_60px_rgba(52,45,36,0.18)] md:px-10">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E6C98F]">
              Next step
            </p>
            <h2 className="text-balance text-3xl font-semibold leading-tight md:text-4xl">{title}</h2>
            <p className="text-pretty text-base leading-7 text-[#D8CFC1]">{description}</p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Link
              href={primaryHref}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#B86B4B] px-5 py-3 text-sm font-semibold text-[#FFFDF8] shadow-[0_8px_20px_rgba(184,107,75,0.28)] transition hover:bg-[#A75F43] focus:outline-none focus:ring-2 focus:ring-[#E6C98F]"
            >
              {primaryLabel}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={secondaryHref}
              className="inline-flex items-center justify-center rounded-full border border-[#F8F3EA]/25 px-5 py-3 text-sm font-semibold text-[#F8F3EA] transition hover:border-[#E6C98F] focus:outline-none focus:ring-2 focus:ring-[#E6C98F]"
            >
              {secondaryLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
