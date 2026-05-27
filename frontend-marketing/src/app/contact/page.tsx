import type { Metadata } from "next";

import { requestDemo } from "@/app/contact/actions";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { brand } from "@/content/marketing";

export const metadata: Metadata = {
  title: "Contact Visora and book a demo",
  description:
    "Tell Visora where your local business is today and get help understanding what to improve first.",
};

export default function ContactPage() {
  return (
    <MarketingShell>
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
            <div className="rounded-lg border border-[#dcc6a4] bg-[#f5e8d1] p-5 text-sm leading-6 text-[#53605a]">
              Prefer email? Contact{" "}
              <a className="font-semibold text-[#8a4b31] underline underline-offset-4" href={`mailto:${brand.email}`}>
                {brand.email}
              </a>
              .
            </div>
          </div>

          <form action={requestDemo} className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-6 shadow-[0_16px_40px_rgba(55,48,40,0.08)]">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-[#17202e]">
                Name
                <input
                  name="name"
                  required
                  autoComplete="name"
                  className="rounded-md border border-[#c7ad84] bg-white px-4 py-3 text-sm text-[#17202e] outline-none focus:border-[#d86f45] focus:ring-2 focus:ring-[#d86f45]/20"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#17202e]">
                Business name
                <input
                  name="businessName"
                  required
                  autoComplete="organization"
                  className="rounded-md border border-[#c7ad84] bg-white px-4 py-3 text-sm text-[#17202e] outline-none focus:border-[#d86f45] focus:ring-2 focus:ring-[#d86f45]/20"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#17202e]">
                Website
                <input
                  name="website"
                  type="url"
                  placeholder="https://"
                  autoComplete="url"
                  className="rounded-md border border-[#c7ad84] bg-white px-4 py-3 text-sm text-[#17202e] outline-none focus:border-[#d86f45] focus:ring-2 focus:ring-[#d86f45]/20"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#17202e]">
                Phone
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  className="rounded-md border border-[#c7ad84] bg-white px-4 py-3 text-sm text-[#17202e] outline-none focus:border-[#d86f45] focus:ring-2 focus:ring-[#d86f45]/20"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#17202e]">
                Email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="rounded-md border border-[#c7ad84] bg-white px-4 py-3 text-sm text-[#17202e] outline-none focus:border-[#d86f45] focus:ring-2 focus:ring-[#d86f45]/20"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#17202e]">
                Google Business Profile URL
                <input
                  name="googleBusinessProfileUrl"
                  type="url"
                  placeholder="Optional"
                  className="rounded-md border border-[#c7ad84] bg-white px-4 py-3 text-sm text-[#17202e] outline-none focus:border-[#d86f45] focus:ring-2 focus:ring-[#d86f45]/20"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#17202e] md:col-span-2">
                What help are you looking for?
                <textarea
                  name="helpNeeded"
                  rows={6}
                  required
                  className="rounded-md border border-[#c7ad84] bg-white px-4 py-3 text-sm text-[#17202e] outline-none focus:border-[#d86f45] focus:ring-2 focus:ring-[#d86f45]/20"
                />
              </label>
            </div>
            <button
              type="submit"
              className="mt-6 rounded-full bg-[#d86f45] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#bf5f3b] focus:outline-none focus:ring-2 focus:ring-[#d86f45]"
            >
              Request demo
            </button>
            <p className="mt-4 text-sm leading-6 text-[#53605a]">
              Tell us where your business is today. We will help you understand what to improve first.
            </p>
          </form>
        </div>
      </section>
    </MarketingShell>
  );
}

