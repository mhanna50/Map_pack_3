import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";

import { CTASection } from "@/components/marketing/CTASection";
import { FAQAccordion } from "@/components/marketing/FAQAccordion";
import { MarketingIcon } from "@/components/marketing/icons";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { getServicePage, servicePages } from "@/content/marketing";

export function generateStaticParams() {
  return servicePages.map((page) => ({ slug: page.slug }));
}

type DynamicPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: DynamicPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getServicePage(slug);
  if (!page) return {};

  return {
    title: page.metaTitle,
    description: page.metaDescription,
  };
}

export default async function ServiceDetailPage({ params }: DynamicPageProps) {
  const { slug } = await params;
  const page = getServicePage(slug);
  if (!page) notFound();

  const related = servicePages.filter((service) => service.slug !== page.slug).slice(0, 4);

  return (
    <MarketingShell>
      <PageHero eyebrow="Service module" title={page.title} description={page.excerpt}>
        <div className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-6 shadow-[0_18px_45px_rgba(55,48,40,0.1)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#24465f] text-[#fff8ec]">
            <MarketingIcon name={page.icon} className="h-6 w-6" />
          </div>
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.16em] text-[#8a4b31]">
            AI-assisted where helpful
          </p>
          <p className="mt-3 text-sm leading-6 text-[#5a665f]">
            Drafts, audits, summaries, and prompts can save time while important decisions stay visible.
          </p>
        </div>
      </PageHero>

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.78fr_1.22fr]">
          <div className="space-y-6">
            <SectionHeader eyebrow="Plain English" title="What it is and why it matters." />
            <div className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-6">
              <h2 className="text-xl font-semibold text-[#17202e]">What it is</h2>
              <p className="mt-3 text-sm leading-7 text-[#53605a]">{page.whatItIs}</p>
            </div>
            <div className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-6">
              <h2 className="text-xl font-semibold text-[#17202e]">Why it matters</h2>
              <p className="mt-3 text-sm leading-7 text-[#53605a]">{page.whyItMatters}</p>
            </div>
          </div>

          <div className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-6">
            <h2 className="text-2xl font-semibold text-[#17202e]">What the platform does</h2>
            <ul className="mt-6 grid gap-4 md:grid-cols-2">
              {page.platformDoes.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-6 text-[#3f4a45]">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-[#6f7f49]" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {page.checks || page.examples || page.ownerControl ? (
        <section className="bg-[#f5e8d1] px-6 py-16">
          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
            {page.checks ? (
              <div className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-6">
                <h2 className="text-xl font-semibold text-[#17202e]">What gets checked</h2>
                <ul className="mt-5 space-y-3">
                  {page.checks.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-6 text-[#53605a]">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-[#6f7f49]" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {page.examples ? (
              <div className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-6">
                <h2 className="text-xl font-semibold text-[#17202e]">Simple examples</h2>
                <ul className="mt-5 space-y-3">
                  {page.examples.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-6 text-[#53605a]">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-[#6f7f49]" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {page.ownerControl ? (
              <div className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-6">
                <h2 className="text-xl font-semibold text-[#17202e]">Owner control</h2>
                <ul className="mt-5 space-y-3">
                  {page.ownerControl.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-6 text-[#53605a]">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-[#6f7f49]" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {page.faqs ? (
        <section className="px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <SectionHeader eyebrow="Questions" title={`Questions about ${page.navLabel.toLowerCase()}.`} align="center" />
            <div className="mt-8">
              <FAQAccordion items={page.faqs} />
            </div>
          </div>
        </section>
      ) : null}

      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <SectionHeader
              eyebrow="Related"
              title="Other pieces that work with this module."
              description="Local SEO works best when profile, reputation, listings, website, and follow-up support each other."
            />
            <Link
              href="/services"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#8a4b31] hover:text-[#d86f45]"
            >
              All services
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {related.map((service) => (
              <Link
                key={service.slug}
                href={`/services/${service.slug}`}
                className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-5 text-sm font-semibold text-[#17202e] transition hover:border-[#d86f45]"
              >
                {service.navLabel}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        title={`Want ${page.navLabel.toLowerCase()} handled without another manual checklist?`}
        description="We will help you understand what is missing, what matters most, and where automation can save time."
      />
    </MarketingShell>
  );
}
