import type { Metadata } from "next";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { StructuredData } from "@/components/marketing/StructuredData";
import { brand } from "@/content/marketing";
import { breadcrumbSchema, createMarketingMetadata } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  title: "Visora Support | Visora",
  description:
    "Get support for Visora login, onboarding, Google Business Profile integrations, billing, lead recovery, and platform questions.",
  path: "/support",
});

export default function SupportPage() {
  return (
    <MarketingShell>
      <StructuredData
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Support", path: "/support" },
        ])}
      />
      <PageHero
        eyebrow="Support"
        title="Need help with Visora?"
        description="Use this page for login, onboarding, integrations, billing, or platform questions."
      />
      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3">
          <div className="md:col-span-1">
            <SectionHeader
              eyebrow="Contact"
              title="Reach support."
              description="Include your business name, account email, and the page or workflow you need help with."
            />
          </div>
          <div className="rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-6 md:col-span-2">
            <p className="text-base leading-7 text-[#5F6673]">
              Email{" "}
              <a className="font-semibold text-[#B86B4B] underline underline-offset-4" href={`mailto:${brand.email}`}>
                {brand.email}
              </a>{" "}
              for account support. If you are not a customer yet, use the contact page to book a demo.
            </p>
            <Link
              href="/contact"
              className="mt-6 inline-flex rounded-full bg-[#B86B4B] px-5 py-3 text-sm font-semibold text-white hover:bg-[#A75F43]"
            >
              Contact / Book Demo
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
