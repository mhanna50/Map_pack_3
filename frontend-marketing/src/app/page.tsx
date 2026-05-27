import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, PhoneCall, Sparkles } from "lucide-react";

import { CTASection } from "@/components/marketing/CTASection";
import { FAQAccordion } from "@/components/marketing/FAQAccordion";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PricingCard } from "@/components/marketing/PricingCard";
import { RetroBadge } from "@/components/marketing/RetroBadge";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { ServiceCard } from "@/components/marketing/ServiceCard";
import { TrustCard } from "@/components/marketing/TrustCard";
import { brand, faqGroups, industries, outcomeFramework, pricingPlans, servicePages } from "@/content/marketing";

export const metadata: Metadata = {
  title: "AI-assisted local visibility software for local businesses",
  description:
    "Visora helps local businesses show up better on Google, manage reviews, clean up listings, understand competitors, and recover missed leads.",
};

const howItWorks = [
  "Connect your business profile.",
  "We audit your local presence.",
  "AI-assisted automations help improve visibility and trust.",
  "You track what changed.",
  "Missed leads get followed up with.",
];

const whyItMatters = [
  "More people finding you when they search nearby.",
  "A better first impression before someone calls.",
  "Fewer missed opportunities from unanswered calls.",
  "A clearer view of what nearby competitors are doing.",
];

export default function Home() {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden px-6 pb-16 pt-32 md:pb-24">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,#fff8ec_0%,#f5ead8_74%,#f8f1e3_100%)]" />
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-4xl text-center">
            <RetroBadge>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {brand.descriptor}
            </RetroBadge>
            <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.02] text-[#17202e] md:text-7xl">
              Your local business, easier to find and easier to trust.
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-pretty text-lg leading-8 text-[#4f5d58] md:text-xl">
              Visora helps local businesses show up better on Google, manage reviews, clean up online
              listings, understand competitors, and recover missed leads - all from one simple platform.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#d86f45] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(216,111,69,0.28)] transition hover:bg-[#bf5f3b] focus:outline-none focus:ring-2 focus:ring-[#d86f45]"
              >
                Book a demo
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/platform"
                className="inline-flex items-center justify-center rounded-full border border-[#c7ad84] bg-[#fffaf0] px-6 py-3 text-sm font-semibold text-[#17202e] transition hover:border-[#d86f45] focus:outline-none focus:ring-2 focus:ring-[#d86f45]"
              >
                See how it works
              </Link>
            </div>
          </div>

          <div className="mt-14 rounded-lg border border-[#dcc6a4] bg-[#17202e] p-3 shadow-[0_28px_80px_rgba(52,45,36,0.2)]">
            <div className="rounded-md border border-white/10 bg-[#1f2b37] p-4 text-[#fff8ec]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e7b35f]">
                    Local visibility board
                  </p>
                  <p className="mt-1 text-2xl font-semibold">Today&apos;s owner view</p>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-[#fff8ec]/10 px-3 py-2 text-sm text-[#dcd2bd]">
                  <PhoneCall className="h-4 w-4 text-[#e7b35f]" aria-hidden="true" />
                  3 missed leads need follow-up
                </div>
              </div>
              <div className="grid gap-3 py-4 md:grid-cols-4">
                {["Reviews", "Listings", "Visibility", "Lead recovery"].map((label, index) => (
                  <div key={label} className="rounded-md border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#c7bda8]">{label}</p>
                    <p className="mt-3 text-3xl font-semibold">{index === 0 ? "+12" : index === 1 ? "8" : index === 2 ? "14" : "5"}</p>
                    <p className="mt-1 text-xs text-[#dcd2bd]">
                      {index === 0 ? "new reviews" : index === 1 ? "listing fixes" : index === 2 ? "keywords moving" : "summaries sent"}
                    </p>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-md border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-[#fff8ec]">AI-assisted next actions</p>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-[#dcd2bd]">
                    <li>Draft a seasonal roof repair post for two service towns.</li>
                    <li>Ask for 5 recent project photos from the field team.</li>
                    <li>Review two citation mismatches before they are corrected.</li>
                  </ul>
                </div>
                <div className="rounded-md border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-[#fff8ec]">Plain-English summary</p>
                  <p className="mt-3 text-sm leading-6 text-[#dcd2bd]">
                    Visibility gets you found. Reputation helps people trust you. Lead recovery helps you avoid wasting the attention you earned.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="Why owners use it"
            title="Built for business owners who do not have time to chase every directory, review, ranking, and missed call."
            description="Local customers search fast. They compare Google results, reviews, photos, and competitors before calling. Visora keeps the important pieces moving with AI-assisted drafting, audits, reminders, and summaries."
            align="center"
          />
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {outcomeFramework.map((item) => (
              <TrustCard key={item.title} title={item.title} body={item.body} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f5e8d1] px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="space-y-5">
            <SectionHeader
              eyebrow="Platform"
              title="One stop for visibility, reputation, listings, website checks, and lead recovery."
              description="Instead of scattered tools and manual reminders, Visora brings local SEO work into a single dashboard that explains what changed and what needs attention."
            />
            <Link
              href="/platform"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#8a4b31] hover:text-[#d86f45]"
            >
              Explore the platform
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <FeatureGrid
            items={[
              { title: "Visibility", body: "Track local movement by keyword, town, and competitor context.", icon: "radar" },
              { title: "Reputation", body: "Request reviews, monitor feedback, and draft responses with care.", icon: "star" },
              { title: "Listings", body: "Find citation gaps and keep business details consistent.", icon: "list" },
              { title: "Lead recovery", body: "Text missed callers, collect details, and alert the owner.", icon: "phone" },
            ]}
          />
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="How it works"
            title="A clear path from profile cleanup to better follow-up."
            description="You get the benefit of AI-assisted local SEO work without handing your business voice to a black box."
            align="center"
          />
          <ol className="mt-10 grid gap-4 md:grid-cols-5">
            {howItWorks.map((step, index) => (
              <li key={step} className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-5">
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8a4b31]">
                  Step {index + 1}
                </span>
                <p className="mt-3 text-base font-semibold leading-6 text-[#17202e]">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-[#fff8ec] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <SectionHeader
              eyebrow="Services"
              title="Every major local visibility module in one place."
              description="Start with the pieces you need most, then expand as your business grows."
            />
            <Link
              href="/services"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#8a4b31] hover:text-[#d86f45]"
            >
              View all services
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {servicePages.slice(0, 6).map((service) => (
              <ServiceCard key={service.slug} service={service} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="space-y-5">
            <SectionHeader
              eyebrow="Why this matters"
              title="Local visibility is only useful when it turns into trust and follow-up."
              description="The platform is designed around practical outcomes, not vague marketing reports."
            />
            <ul className="space-y-3">
              {whyItMatters.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-6 text-[#3f4a45]">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-[#6f7f49]" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-5">
            <Image
              src="/flow.svg"
              alt="Flow from visibility to trust, consistency, and lead recovery"
              width={667}
              height={667}
              className="mx-auto h-auto w-full max-w-xl"
            />
          </div>
        </div>
      </section>

      <section className="bg-[#f5e8d1] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="Industries"
            title="Made for local businesses that win through trust, timing, and follow-up."
            description="The same framework works across service businesses because customers search, compare, and call in familiar patterns."
            align="center"
          />
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {industries.map((industry) => (
              <span
                key={industry}
                className="rounded-full border border-[#c7ad84] bg-[#fffaf0] px-4 py-2 text-sm font-semibold text-[#3f4a45]"
              >
                {industry}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="Pricing"
            title="Simple tiers for presence, visibility, and lead recovery."
            description="No unrealistic ranking guarantees. Just clear software, practical automation, and owner-friendly reporting."
            align="center"
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <PricingCard key={plan.name} plan={plan} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#fff8ec] px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeader
            eyebrow="FAQ"
            title="Helpful answers before you book a demo."
            description="Local SEO can feel like a pile of acronyms. The platform is designed to make it understandable."
          />
          <FAQAccordion items={faqGroups.flatMap((group) => group.items).slice(0, 6)} />
        </div>
      </section>

      <CTASection />
    </MarketingShell>
  );
}

