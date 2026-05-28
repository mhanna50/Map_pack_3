import type { Metadata } from "next";

import { CTASection } from "@/components/marketing/CTASection";
import { BeforeAfterPanel, FounderNote, PlainEnglishBox } from "@/components/marketing/EditorialBlocks";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { ServiceCard } from "@/components/marketing/ServiceCard";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { StructuredData } from "@/components/marketing/StructuredData";
import { servicePages } from "@/content/marketing";
import { breadcrumbSchema, createMarketingMetadata, faqSchema, itemListSchema } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  title: "Local SEO Services Software | Visora",
  description:
    "Explore local SEO software modules for GBP management, reviews, citations, rank tracking, website audits, lead recovery, and reporting.",
  path: "/services",
  keywords: ["local SEO services software", "local business marketing automation tools", "local SEO management platform"],
});

const servicesFaq = [
  {
    question: "Which local SEO service should I start with?",
    answer:
      "Start with the weakest trust signal. For many businesses that means Google Business Profile completeness, reviews, citations, or missed-call follow-up.",
  },
  {
    question: "What does a local business need most?",
    answer:
      "Most service businesses need to be findable, look trustworthy, keep business information consistent, and make it easy for customers to contact them.",
  },
  {
    question: "Can these services work together?",
    answer:
      "Yes. Rank tracking, reviews, citations, profile content, photos, Q&A, and lead recovery are stronger when they feed one shared dashboard.",
  },
];

export default function ServicesPage() {
  return (
    <MarketingShell>
      <StructuredData
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Services", path: "/services" },
          ]),
          itemListSchema(
            servicePages.map((page) => ({
              name: page.navLabel,
              path: `/services/${page.slug}`,
              description: page.excerpt,
            })),
            "Visora local SEO service modules",
          ),
          faqSchema(servicesFaq),
        ]}
      />
      <PageHero
        eyebrow="Services"
        title="Local SEO services software for the work that helps customers find and trust you."
        description="Visora organizes Google Business Profile management, reviews, citations, local rank tracking, website audits, photos, Q&A, lead recovery, and reporting in one local visibility platform."
      />

      <section className="bg-[#F8F3EA] px-6 py-10">
        <PlainEnglishBox
          className="mx-auto max-w-4xl"
          title="What this means in plain English"
          body="Local SEO works best when your profile, reviews, listings, website, content, and follow-up support each other. These service modules help a business owner see what is missing, what matters, and what should happen next."
        />
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <BeforeAfterPanel
            beforeTitle="Scattered work"
            afterTitle="Connected service modules"
            beforeItems={[
              "Reviews are in one tool, listings are in another, and profile content depends on memory.",
              "The owner sees activity but not what should happen next.",
              "Lead follow-up is treated separately from the visibility work that created the call.",
            ]}
            afterItems={[
              "Every module supports findability, trust, consistency, or follow-up.",
              "The dashboard explains the work in plain language.",
              "Owners can start with the weakest signal and add more as they grow.",
            ]}
          />
          <FounderNote>
            This service library is intentionally practical. A contractor, med spa, salon, dentist, or repair
            shop should be able to understand what each module changes without learning SEO jargon first.
          </FounderNote>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="Overview"
            title="What Visora can help manage."
            description="Every card explains what the service is, why it matters, and what the platform does."
            align="center"
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {servicePages.map((service) => (
              <ServiceCard key={service.slug} service={service} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#F8F3EA] px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3">
          {servicesFaq.map((item) => (
            <section key={item.question} className="rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-6">
              <h2 className="text-xl font-semibold text-[#14213D]">{item.question}</h2>
              <p className="mt-3 text-sm leading-7 text-[#5F6673]">{item.answer}</p>
            </section>
          ))}
        </div>
      </section>

      <CTASection />
    </MarketingShell>
  );
}
