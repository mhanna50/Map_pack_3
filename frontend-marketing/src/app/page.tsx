import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";

import { CTASection } from "@/components/marketing/CTASection";
import {
  BeforeAfterPanel,
  FounderNote,
  LocalBusinessExample,
  PlainEnglishBox,
} from "@/components/marketing/EditorialBlocks";
import { FAQAccordion } from "@/components/marketing/FAQAccordion";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PricingCard } from "@/components/marketing/PricingCard";
import { RetroBadge } from "@/components/marketing/RetroBadge";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { ServiceCard } from "@/components/marketing/ServiceCard";
import { StructuredData } from "@/components/marketing/StructuredData";
import { TrustCard } from "@/components/marketing/TrustCard";
import { brand, faqGroups, industries, outcomeFramework, pricingPlans, servicePages } from "@/content/marketing";
import { createMarketingMetadata, faqSchema, softwareApplicationSchema } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  title: "Local SEO Software for Service Businesses | Visora",
  description:
    "Visora helps local businesses improve visibility, manage reviews, clean up listings, and recover missed leads from one dashboard.",
  path: "/",
  keywords: ["local SEO software", "local visibility platform", "local reputation management", "local business growth software"],
});

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

const customerLeakPoints = [
  {
    issue: "Outdated Google profile",
    detail: "Hours, services, photos, or Q&A feel stale when a customer is trying to choose quickly.",
  },
  {
    issue: "Weak review rhythm",
    detail: "Happy customers move on before anyone asks, and the newest reviews get older every week.",
  },
  {
    issue: "Inconsistent listings",
    detail: "A wrong phone number or old address can make a real business look careless.",
  },
  {
    issue: "No recent photos",
    detail: "A profile with only a logo and old pictures feels less alive than one with real job photos.",
  },
  {
    issue: "Missed calls",
    detail: "If someone calls three roofers during a leak, the first useful response usually has the best chance.",
  },
  {
    issue: "No competitor context",
    detail: "You may be doing good work without seeing why another nearby business looks easier to trust.",
  },
];

const homeFaq = [
  {
    question: "What does Visora help local businesses do?",
    answer:
      "Visora helps local businesses improve Google visibility, manage reviews, clean up listings, understand local rankings, monitor competitors, and recover missed leads from one dashboard.",
  },
  {
    question: "Do I need to understand SEO to use it?",
    answer:
      "No. Visora is built for business owners who want clear next steps in plain language, not a pile of SEO acronyms.",
  },
  {
    question: "Does this replace an agency?",
    answer:
      "Not necessarily. Visora is software that can support owners, teams, or agency-style workflows by organizing the work and making local visibility easier to manage.",
  },
  {
    question: "Does Visora guarantee rankings?",
    answer:
      "No. Search results depend on many factors. Visora helps improve profile quality, reviews, listings, content, reporting, and follow-up without promising guaranteed placement.",
  },
];

export default function Home() {
  return (
    <MarketingShell>
      <StructuredData data={[softwareApplicationSchema(), faqSchema(homeFaq)]} />
      <section className="relative overflow-hidden px-6 pb-0 pt-32">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,#F8F3EA_0%,#F8F3EA_72%,rgba(248,243,234,0)_100%)]" />
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-4xl text-center">
            <RetroBadge>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {brand.descriptor}
            </RetroBadge>
            <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.02] text-[#14213D] md:text-7xl">
              Your local business, easier to find and easier to trust.
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-pretty text-lg leading-8 text-[#5F6673] md:text-xl">
              Visora helps local businesses manage Google visibility, reviews, listings, photos, and missed
              lead follow-up from one calm dashboard.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#B86B4B] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(216,111,69,0.28)] transition hover:bg-[#A75F43] focus:outline-none focus:ring-2 focus:ring-[#B86B4B]"
              >
                Book a demo
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/platform"
                className="inline-flex items-center justify-center rounded-full border border-[#D8CFC1] bg-[#FFFDF8] px-6 py-3 text-sm font-semibold text-[#14213D] transition hover:border-[#B86B4B] focus:outline-none focus:ring-2 focus:ring-[#B86B4B]"
              >
                See how it works
              </Link>
            </div>
          </div>

          <div className="relative z-10 mx-auto mt-14 max-w-5xl -mb-28 md:-mb-40">
            <div className="rounded-[26px] border border-[#D8CFC1] bg-[#FFFDF8] p-2 shadow-[0_34px_90px_rgba(20,33,61,0.18)]">
              <Image
                src="/dashboard-preview.svg"
                alt="Visora client dashboard showing profile fixes, reviews, listings, visibility movement, and lead recovery tasks"
                width={1280}
                height={760}
                priority
                className="h-auto w-full rounded-[20px]"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-16 pt-44 md:pt-56">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div className="space-y-5">
            <SectionHeader
              eyebrow="What this actually means"
              title="Local visibility is not just rankings. It is the whole first impression."
              description="A customer usually sees your profile, reviews, photos, business details, and response speed before they decide whether you feel like the right call."
            />
            <FounderNote>
              This was built for businesses that need practical local visibility help, not another confusing
              marketing tool. You do not need to become an SEO expert to see what needs attention.
            </FounderNote>
          </div>
          <PlainEnglishBox
            title="Plain English"
            body="Visibility gets you found. Reviews and photos help people trust you. Consistent listings reduce friction. Lead recovery helps you avoid wasting the attention you already earned."
          />
        </div>
      </section>

      <section className="bg-[#F8F3EA] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="Where customers slip away"
            title="Most local businesses lose trust before they ever get the call."
            description="These are small, ordinary gaps. The problem is that customers notice them at exactly the wrong moment."
            align="center"
          />
          <div className="mt-10 divide-y divide-[#D8CFC1] overflow-hidden rounded-lg border border-[#D8CFC1] bg-[#FFFDF8]">
            {customerLeakPoints.map((item, index) => (
              <div key={item.issue} className="grid gap-3 p-5 md:grid-cols-[96px_0.7fr_1.3fr] md:items-center">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B86B4B]">
                  Note {index + 1}
                </span>
                <h2 className="text-lg font-semibold text-[#14213D]">{item.issue}</h2>
                <p className="text-sm leading-6 text-[#5F6673]">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <BeforeAfterPanel
            beforeTitle="When pieces are scattered"
            afterTitle="When Visora keeps them together"
            beforeItems={[
              "A post gets written one week and forgotten the next.",
              "Reviews arrive on different sites with no clear owner response.",
              "Listings are checked only when someone complains.",
              "A missed call turns into a lost job before anyone notices.",
            ]}
            afterItems={[
              "Profile, reviews, listings, photos, visibility, and lead follow-up sit in one owner view.",
              "The dashboard shows what changed, what needs approval, and what to do next.",
              "Automations help with reminders and drafts while the business keeps control.",
            ]}
          />
          <LocalBusinessExample example="A busy HVAC owner can see that one town is slipping in visibility, two reviews need a response, a directory has the wrong phone number, and a missed caller needs follow-up without opening six different tools." />
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

      <section className="bg-[#F8F3EA] px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="space-y-5">
            <SectionHeader
              eyebrow="Platform"
              title="One stop for visibility, reputation, listings, website checks, and lead recovery."
              description="Instead of scattered tools and manual reminders, Visora brings local SEO work into a single dashboard that explains what changed and what needs attention."
            />
            <Link
              href="/platform"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#B86B4B] hover:text-[#B86B4B]"
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
              <li key={step} className="rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-5">
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[#B86B4B]">
                  Step {index + 1}
                </span>
                <p className="mt-3 text-base font-semibold leading-6 text-[#14213D]">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-[#F8F3EA] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <SectionHeader
              eyebrow="Services"
              title="Every major local visibility module in one place."
              description="Start with the pieces you need most, then expand as your business grows."
            />
            <Link
              href="/services"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#B86B4B] hover:text-[#B86B4B]"
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
                <li key={item} className="flex gap-3 text-sm leading-6 text-[#5F6673]">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-[#7A8463]" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-5">
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

      <section className="bg-[#F8F3EA] px-6 py-16">
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
                className="rounded-full border border-[#D8CFC1] bg-[#FFFDF8] px-4 py-2 text-sm font-semibold text-[#5F6673]"
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

      <section className="bg-[#F8F3EA] px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeader
            eyebrow="FAQ"
            title="Helpful answers before you book a demo."
            description="Local SEO can feel like a pile of acronyms. The platform is designed to make it understandable."
          />
          <FAQAccordion items={faqGroups.flatMap((group) => group.items).slice(0, 6)} />
          <div className="lg:col-start-2">
            <FAQAccordion items={homeFaq} />
          </div>
        </div>
      </section>

      <CTASection />
    </MarketingShell>
  );
}
