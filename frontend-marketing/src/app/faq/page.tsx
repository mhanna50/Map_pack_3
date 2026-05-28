import type { Metadata } from "next";

import { CTASection } from "@/components/marketing/CTASection";
import { FAQAccordion } from "@/components/marketing/FAQAccordion";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { StructuredData } from "@/components/marketing/StructuredData";
import { faqGroups } from "@/content/marketing";
import { breadcrumbSchema, createMarketingMetadata, faqSchema } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  title: "Local SEO Software FAQ | Visora",
  description:
    "Answers about Visora, local SEO, GBP, reviews, citations, rank tracking, lead recovery, pricing, onboarding, and security.",
  path: "/faq",
  keywords: ["local SEO software FAQ", "Visora FAQ", "local business SEO questions"],
});

export default function FAQPage() {
  return (
    <MarketingShell>
      <StructuredData
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "FAQ", path: "/faq" },
          ]),
          faqSchema(faqGroups.flatMap((group) => group.items)),
        ]}
      />
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
                <h2 className="text-2xl font-semibold text-[#14213D]">{group.heading}</h2>
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
