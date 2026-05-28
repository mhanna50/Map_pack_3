import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";

import { CTASection } from "@/components/marketing/CTASection";
import {
  BeforeAfterPanel,
  CommonMistakes,
  FounderNote,
  LocalBusinessExample,
  PlainEnglishBox,
  RetroChecklist,
} from "@/components/marketing/EditorialBlocks";
import { FAQAccordion } from "@/components/marketing/FAQAccordion";
import { MarketingIcon } from "@/components/marketing/icons";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { StructuredData } from "@/components/marketing/StructuredData";
import { getServiceFaqs, getServicePage, getServiceRelatedLinks, servicePages } from "@/content/marketing";
import { breadcrumbSchema, createMarketingMetadata, faqSchema, serviceSchema } from "@/lib/seo";

export function generateStaticParams() {
  return servicePages.map((page) => ({ slug: page.slug }));
}

type DynamicPageProps = {
  params: Promise<{ slug: string }>;
};

const serviceExamples: Record<string, string> = {
  "google-business-profile":
    "A plumber may have strong word of mouth, but if the profile has old hours and no emergency service listed, a stressed customer may call the next business instead.",
  "gbp-posting":
    "A seasonal post about AC tune-ups in May or roof leak repairs after a storm feels more useful than a generic weekly update.",
  "gbp-audits":
    "An HVAC company can look active in reviews but still miss trust signals if holiday hours, service descriptions, and recent photos are thin.",
  "review-management":
    "A customer who had a great experience is most likely to leave a review right after the job, not three weeks later.",
  "review-monitoring":
    "A slow scheduling complaint on one review site should not sit unnoticed while the owner only checks Google.",
  "citation-management":
    "If your phone number is correct on Google but wrong on an old directory, a customer may call the wrong number or lose trust.",
  "local-rank-tracking":
    "You might show up near your office but disappear two towns over, even for the same service keyword.",
  "competitor-monitoring":
    "A nearby competitor may not be better at the work, but they may look easier to trust because they post more often and have newer reviews.",
  "local-website-seo-audits":
    "A homeowner may find you on Google, click your site, and leave if the service page is slow, vague, or missing a clear phone number.",
  "photo-image-requests":
    "A profile with recent job photos feels more alive than one with a logo and three old pictures.",
  "qa-management":
    "If customers keep asking whether you serve their town, that answer should be easy to find before they call.",
  "lead-recovery":
    "If someone calls three roofers during a leak, the first one to respond usually has the best chance.",
  reporting:
    "A monthly report should help an owner understand what changed and what needs attention, not just show a pile of activity.",
};

const serviceMistakes: Record<string, string[]> = {
  "google-business-profile": [
    "Setting up the profile once and assuming it still reflects the business.",
    "Letting hours, services, categories, or photos drift out of date.",
    "Ignoring questions or reviews because they are inside Google instead of your inbox.",
  ],
  "gbp-posting": [
    "Posting only generic updates that do not connect to real services or seasons.",
    "Letting the profile go quiet during busy months when customers are actively comparing options.",
    "Publishing copy that sounds like an ad instead of a helpful local update.",
  ],
  "gbp-audits": [
    "Checking only the business name and phone number while missing thin services or stale photos.",
    "Treating audit findings like a technical report instead of a practical task list.",
    "Waiting until calls slow down before reviewing what customers see first.",
  ],
  "review-management": [
    "Asking too late, after the customer has moved on.",
    "Only responding to positive reviews and leaving hard ones untouched.",
    "Sending review requests without a simple owner-approved rhythm.",
  ],
  "review-monitoring": [
    "Checking only one review source.",
    "Missing patterns because praise and complaints are spread across platforms.",
    "Treating every review as separate instead of looking for repeated themes.",
  ],
  "citation-management": [
    "Assuming Google is the only listing customers use.",
    "Leaving old addresses, phone numbers, or business names live across directories.",
    "Fixing listings once and never checking for drift.",
  ],
  "local-rank-tracking": [
    "Looking at one search from one location and calling it the whole picture.",
    "Tracking vanity keywords instead of services customers actually search.",
    "Ignoring nearby competitors when visibility changes.",
  ],
  "competitor-monitoring": [
    "Copying competitors instead of learning from the trust signals they show.",
    "Obsessing over rankings without checking reviews, photos, services, and profile quality.",
    "Missing simple gaps because no one reviews the local market regularly.",
  ],
  "local-website-seo-audits": [
    "Treating the website like a brochure instead of a call-and-contact path.",
    "Hiding services, locations, phone numbers, or forms behind vague pages.",
    "Focusing only on technical scores while the message stays unclear.",
  ],
  "photo-image-requests": [
    "Using stock photos where real work photos would build more trust.",
    "Waiting for a perfect shoot instead of collecting useful field photos.",
    "Letting months pass with no fresh visual proof of active work.",
  ],
  "qa-management": [
    "Leaving common questions unanswered on the public profile.",
    "Giving vague answers that do not reflect actual service areas or policies.",
    "Letting customers ask the same thing repeatedly instead of making answers easy to find.",
  ],
  "lead-recovery": [
    "Assuming a missed caller will leave a voicemail or call back later.",
    "Changing the main number when forwarding missed calls would be enough.",
    "Following up without collecting the job details that make the call useful.",
  ],
  reporting: [
    "Sending reports that list activity without explaining what matters.",
    "Separating reviews, visibility, listings, and lead recovery into disconnected updates.",
    "Waiting too long to surface issues that need owner attention.",
  ],
};

export async function generateMetadata({ params }: DynamicPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getServicePage(slug);
  if (!page) return {};

  return createMarketingMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: `/services/${page.slug}`,
    keywords: [page.navLabel, "local SEO software", "local visibility platform", "local business software"],
  });
}

export default async function ServiceDetailPage({ params }: DynamicPageProps) {
  const { slug } = await params;
  const page = getServicePage(slug);
  if (!page) notFound();

  const faqs = getServiceFaqs(page.slug);
  const relatedLinks = getServiceRelatedLinks(page.slug);
  const related = servicePages.filter((service) => service.slug !== page.slug).slice(0, 4);
  const realWorldExample = serviceExamples[page.slug] ?? page.examples?.[0] ?? page.excerpt;
  const mistakes =
    serviceMistakes[page.slug] ??
    [
      `Treating ${page.navLabel.toLowerCase()} as a one-time setup instead of ongoing local visibility work.`,
      "Letting small trust gaps sit because no one owns the follow-up.",
      "Using generic marketing copy when customers need clear answers.",
    ];

  return (
    <MarketingShell>
      <StructuredData
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Services", path: "/services" },
            { name: page.navLabel, path: `/services/${page.slug}` },
          ]),
          serviceSchema(page),
          ...(faqs.length ? [faqSchema(faqs)] : []),
        ]}
      />
      <PageHero eyebrow="Service module" title={page.title} description={page.excerpt}>
        <div className="rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-6 shadow-[0_18px_45px_rgba(55,48,40,0.1)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#14213D] text-[#F8F3EA]">
            <MarketingIcon name={page.icon} className="h-6 w-6" />
          </div>
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.16em] text-[#B86B4B]">
            AI-assisted where helpful
          </p>
          <p className="mt-3 text-sm leading-6 text-[#5F6673]">
            Drafts, audits, summaries, and prompts can save time while important decisions stay visible.
          </p>
        </div>
      </PageHero>

      <section className="bg-[#F8F3EA] px-6 py-10">
        <PlainEnglishBox
          className="mx-auto max-w-4xl"
          body={`${page.whatItIs} Visora helps local business owners organize this work so they can get found, look trustworthy, stay consistent online, and follow up when interest turns into a lead.`}
        />
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.78fr_1.22fr]">
          <div className="space-y-6">
            <SectionHeader eyebrow="Plain English" title="What it is and why it matters." />
            <div className="rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-6">
              <h2 className="text-xl font-semibold text-[#14213D]">What it is</h2>
              <p className="mt-3 text-sm leading-7 text-[#5F6673]">{page.whatItIs}</p>
            </div>
            <div className="rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-6">
              <h2 className="text-xl font-semibold text-[#14213D]">Why it matters</h2>
              <p className="mt-3 text-sm leading-7 text-[#5F6673]">{page.whyItMatters}</p>
            </div>
          </div>

          <div className="rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-6">
            <h2 className="text-2xl font-semibold text-[#14213D]">What the platform does</h2>
            <ul className="mt-6 grid gap-4 md:grid-cols-2">
              {page.platformDoes.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-6 text-[#5F6673]">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-[#7A8463]" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-start-2">
            <LocalBusinessExample example={realWorldExample} />
          </div>
        </div>
      </section>

      {page.checks || page.examples || page.ownerControl ? (
        <section className="bg-[#F8F3EA] px-6 py-16">
          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
            {page.checks ? (
              <RetroChecklist title="What gets checked" items={page.checks} />
            ) : null}
            {page.examples ? (
              <RetroChecklist title="Useful examples" items={page.examples} />
            ) : null}
            {page.ownerControl ? (
              <RetroChecklist title="Owner control" items={page.ownerControl} />
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <CommonMistakes items={mistakes} />
          <BeforeAfterPanel
            beforeTitle="Without a system"
            afterTitle="With a calmer workflow"
            beforeItems={[
              "The owner remembers the issue only when calls slow down.",
              "Tasks live across notes, spreadsheets, email, and disconnected tools.",
              "Customers see gaps before the business notices them.",
            ]}
            afterItems={[
              "The module turns the work into visible next steps.",
              "AI-assisted drafts and checks save time while approvals stay clear.",
              "Owners can see what changed and what still needs attention.",
            ]}
          />
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <SectionHeader
            eyebrow="Who it helps"
            title="Built for local businesses that need clearer visibility work."
            description="Contractors, HVAC companies, plumbers, roofers, med spas, salons, dentists, auto repair shops, cleaners, landscapers, and professional services can all use this module as part of a practical local SEO system."
          />
          <div className="grid gap-4 md:grid-cols-2">
            {[
              "Business owners who want plain-language next steps.",
              "Teams that need fewer scattered tools and spreadsheets.",
              "Service businesses competing in Google Search and Maps.",
              "Admins managing local visibility across multiple clients or locations.",
            ].map((item) => (
              <div key={item} className="rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-5 text-sm leading-6 text-[#5F6673]">
                {item}
              </div>
            ))}
          </div>
        </div>
        <FounderNote className="mx-auto mt-10 max-w-6xl">
          No magic rankings here. The point is to make the work visible, practical, and easier to keep up with
          so your online presence reflects the business customers would actually experience.
        </FounderNote>
      </section>

      {faqs.length ? (
        <section className="px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <SectionHeader eyebrow="Questions" title={`Questions about ${page.navLabel.toLowerCase()}.`} align="center" />
            <div className="mt-8">
              <FAQAccordion items={faqs} />
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
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#B86B4B] hover:text-[#B86B4B]"
            >
              All services
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {relatedLinks.length ? relatedLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-5 text-sm font-semibold text-[#14213D] transition hover:border-[#B86B4B]"
              >
                {link.label}
              </Link>
            )) : related.map((service) => (
              <Link
                key={service.slug}
                href={`/services/${service.slug}`}
                className="rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-5 text-sm font-semibold text-[#14213D] transition hover:border-[#B86B4B]"
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
