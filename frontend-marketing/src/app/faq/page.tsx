import type { Metadata } from "next";

import { CTASection } from "@/components/marketing/CTASection";
import { FAQAccordion } from "@/components/marketing/FAQAccordion";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { faqGroups } from "@/content/marketing";

export const metadata: Metadata = {
  title: "FAQ for local SEO, reviews, citations, visibility, lead recovery, and setup",
  description:
    "Answers to common questions about Visora, local SEO basics, Google Business Profile, reviews, citations, rank tracking, lead recovery, pricing, onboarding, and security.",
};

export default function FAQPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="FAQ"
        title="Answers for local business owners."
        description="No jargon wall. Just practical answers about local SEO, Google Business Profile, reviews, citations, visibility, lead recovery, pricing, setup, and data."
      />

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-8">
          {faqGroups.map((group) => (
            <section key={group.heading} className="grid gap-5 lg:grid-cols-[280px_1fr]">
              <div>
                <h2 className="text-2xl font-semibold text-[#17202e]">{group.heading}</h2>
              </div>
              <FAQAccordion items={group.items} />
            </section>
          ))}
        </div>
      </section>

      <CTASection />
    </MarketingShell>
  );
}

