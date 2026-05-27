import type { Metadata } from "next";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { brand } from "@/content/marketing";

export const metadata: Metadata = {
  title: "Support",
  description: "Get support for Visora login, onboarding, integrations, billing, and platform questions.",
};

export default function SupportPage() {
  return (
    <MarketingShell>
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
          <div className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-6 md:col-span-2">
            <p className="text-base leading-7 text-[#53605a]">
              Email{" "}
              <a className="font-semibold text-[#8a4b31] underline underline-offset-4" href={`mailto:${brand.email}`}>
                {brand.email}
              </a>{" "}
              for account support. If you are not a customer yet, use the contact page to book a demo.
            </p>
            <Link
              href="/contact"
              className="mt-6 inline-flex rounded-full bg-[#d86f45] px-5 py-3 text-sm font-semibold text-white hover:bg-[#bf5f3b]"
            >
              Contact / Book Demo
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

