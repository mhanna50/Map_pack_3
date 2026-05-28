import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { CTASection } from "@/components/marketing/CTASection";
import { FAQAccordion } from "@/components/marketing/FAQAccordion";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { PricingCard } from "@/components/marketing/PricingCard";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { StructuredData } from "@/components/marketing/StructuredData";
import { faqGroups, pricingPlans } from "@/content/marketing";
import { breadcrumbSchema, createMarketingMetadata, faqSchema } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  title: "Local SEO Software Pricing | Visora",
  description:
    "Simple local SEO software pricing for GBP management, reviews, citations, rank tracking, lead recovery, and reporting.",
  path: "/pricing",
  keywords: ["local SEO software pricing", "Google Business Profile management pricing", "review management pricing"],
});

const pricingFaq = faqGroups
  .flatMap((group) => group.items)
  .filter((item) =>
    [
      "Do I need to understand SEO to use Visora?",
      "Do I need to change my phone number?",
      "Can I keep my current website?",
      "How fast will I see results?",
      "Is Visora an agency or software?",
      "Can I cancel?",
      "Do you guarantee rankings?",
    ].includes(item.question),
  );

export default function PricingPage() {
  return (
    <MarketingShell>
      <StructuredData
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Pricing", path: "/pricing" },
          ]),
          faqSchema(pricingFaq),
        ]}
      />
      <PageHero
        eyebrow="Pricing"
        title="Local SEO software pricing for presence, visibility, and lead recovery."
        description="Choose the level that fits where your business is today. Pricing uses starting points where existing plans are configured, and Pro is scoped through a demo."
      />

      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-4 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <PricingCard key={plan.name} plan={plan} />
            ))}
          </div>
          <div className="mt-8 rounded-lg border border-[#D8CFC1] bg-[#F8F3EA] p-5 text-sm leading-6 text-[#5F6673]">
            Prices are shown as starting points based on available plan configuration. Final pricing can vary by
            locations, integrations, lead recovery needs, and support scope. No Stripe price IDs are hardcoded
            on this marketing page.
          </div>
        </div>
      </section>

      <section className="bg-[#F8F3EA] px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <SectionHeader
            eyebrow="Not sure?"
            title="Start with the problem you actually need solved."
            description="If your profile is thin, start with Presence. If competitors are outranking you, look at Visibility. If missed calls are costing jobs, Pro is worth discussing."
          />
          <div className="rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-6">
            <h2 className="text-2xl font-semibold text-[#14213D]">A good demo should answer three questions.</h2>
            <ol className="mt-5 space-y-3 text-sm leading-6 text-[#5F6673]">
              <li>1. What is hurting trust or visibility today?</li>
              <li>2. Which pieces can be automated safely?</li>
              <li>3. What should stay in owner approval?</li>
            </ol>
            <Link
              href="/contact"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#B86B4B] hover:text-[#B86B4B]"
            >
              Book a demo
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <SectionHeader eyebrow="Pricing FAQ" title="Straight answers before you decide." align="center" />
          <div className="mt-8">
            <FAQAccordion items={pricingFaq} />
          </div>
        </div>
      </section>

      <CTASection
        title="Want help choosing the right tier?"
        description="Tell us where your local presence stands today. We will help you decide what matters first."
      />
    </MarketingShell>
  );
}
