import type { Metadata } from "next";

import { requestDemo } from "@/app/contact/actions";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { StructuredData } from "@/components/marketing/StructuredData";
import { brand } from "@/content/marketing";
import { breadcrumbSchema, createMarketingMetadata } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  title: "Book a Local SEO Platform Demo | Visora",
  description:
    "Contact Visora to discuss Google visibility, reviews, listings, website basics, lead recovery, and what your business should improve first.",
  path: "/contact",
  keywords: ["book local SEO demo", "local SEO platform demo", "contact Visora"],
});

export default function ContactPage() {
  return (
    <MarketingShell>
      <StructuredData
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Contact", path: "/contact" },
        ])}
      />
      <PageHero
        eyebrow="Contact"
        title="Tell us where your business is today."
        description="We will help you understand what to improve first across Google visibility, reviews, listings, website basics, and lead recovery."
      />

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.75fr_1.25fr]">
          <div className="space-y-6">
            <SectionHeader
              eyebrow="Book demo"
              title="A useful conversation starts with the basics."
              description="Share what you have now. We can talk through where the biggest gaps are and whether Visora is a fit."
            />
            <div className="rounded-lg border border-[#D8CFC1] bg-[#F8F3EA] p-5 text-sm leading-6 text-[#5F6673]">
              Prefer email? Contact{" "}
              <a className="font-semibold text-[#B86B4B] underline underline-offset-4" href={`mailto:${brand.email}`}>
                {brand.email}
              </a>
              .
            </div>
          </div>

          <form action={requestDemo} className="rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-6 shadow-[0_16px_40px_rgba(55,48,40,0.08)]">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-[#14213D]">
                Name
                <input
                  name="name"
                  required
                  autoComplete="name"
                  className="rounded-md border border-[#D8CFC1] bg-white px-4 py-3 text-sm text-[#14213D] outline-none focus:border-[#B86B4B] focus:ring-2 focus:ring-[#B86B4B]/20"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#14213D]">
                Business name
                <input
                  name="businessName"
                  required
                  autoComplete="organization"
                  className="rounded-md border border-[#D8CFC1] bg-white px-4 py-3 text-sm text-[#14213D] outline-none focus:border-[#B86B4B] focus:ring-2 focus:ring-[#B86B4B]/20"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#14213D]">
                Website
                <input
                  name="website"
                  type="url"
                  placeholder="https://"
                  autoComplete="url"
                  className="rounded-md border border-[#D8CFC1] bg-white px-4 py-3 text-sm text-[#14213D] outline-none focus:border-[#B86B4B] focus:ring-2 focus:ring-[#B86B4B]/20"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#14213D]">
                Phone
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  className="rounded-md border border-[#D8CFC1] bg-white px-4 py-3 text-sm text-[#14213D] outline-none focus:border-[#B86B4B] focus:ring-2 focus:ring-[#B86B4B]/20"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#14213D]">
                Email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="rounded-md border border-[#D8CFC1] bg-white px-4 py-3 text-sm text-[#14213D] outline-none focus:border-[#B86B4B] focus:ring-2 focus:ring-[#B86B4B]/20"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#14213D]">
                Google Business Profile URL
                <input
                  name="googleBusinessProfileUrl"
                  type="url"
                  placeholder="Optional"
                  className="rounded-md border border-[#D8CFC1] bg-white px-4 py-3 text-sm text-[#14213D] outline-none focus:border-[#B86B4B] focus:ring-2 focus:ring-[#B86B4B]/20"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#14213D] md:col-span-2">
                What help are you looking for?
                <textarea
                  name="helpNeeded"
                  rows={6}
                  required
                  className="rounded-md border border-[#D8CFC1] bg-white px-4 py-3 text-sm text-[#14213D] outline-none focus:border-[#B86B4B] focus:ring-2 focus:ring-[#B86B4B]/20"
                />
              </label>
            </div>
            <button
              type="submit"
              className="mt-6 rounded-full bg-[#B86B4B] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#A75F43] focus:outline-none focus:ring-2 focus:ring-[#B86B4B]"
            >
              Request demo
            </button>
            <p className="mt-4 text-sm leading-6 text-[#5F6673]">
              Tell us where your business is today. We will help you understand what to improve first.
            </p>
          </form>
        </div>
      </section>
    </MarketingShell>
  );
}
