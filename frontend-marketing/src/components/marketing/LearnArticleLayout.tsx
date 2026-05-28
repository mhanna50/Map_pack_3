import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { PageHero } from "@/components/marketing/PageHero";
import { CTASection } from "@/components/marketing/CTASection";
import {
  FounderNote,
  LocalBusinessExample,
  PlainEnglishBox,
  RetroChecklist,
} from "@/components/marketing/EditorialBlocks";
import { FAQAccordion } from "@/components/marketing/FAQAccordion";
import { getLearnFaqs, getLearnRelatedLinks, type LearnPage } from "@/content/marketing";

const articleExamples: Record<string, string> = {
  "what-is-local-seo":
    "A cleaner does not need to rank nationwide. They need nearby homeowners to find the right service page, trust the reviews, and know how to book.",
  "google-map-pack":
    "For a search like emergency plumber near me, many customers call directly from the map results without visiting a website first.",
  "google-business-profile":
    "If a salon has current hours, recent photos, services, and answered questions, booking feels easier before a customer ever calls.",
  "why-reviews-matter":
    "A thoughtful response to a hard review can show future customers that the business pays attention and handles problems carefully.",
  "what-are-citations":
    "An old phone number on a directory can send a ready-to-buy customer to the wrong place, even if Google is correct.",
  "local-seo-checklist":
    "A roofer can use the checklist after storm season to review hours, services, photos, missed calls, and review requests in one pass.",
  "local-seo-for-service-businesses":
    "A med spa, roofer, and auto repair shop need different proof, but all three need clear services, trust signals, and easy follow-up.",
  "local-seo-vs-traditional-seo":
    "A local HVAC company is usually trying to win nearby service calls, not publish the biggest national article about air conditioners.",
  "local-visibility-turns-into-leads":
    "Getting found only matters if the caller trusts what they see and gets a useful response before they move to the next option.",
};

export function LearnArticleLayout({ page }: { page: LearnPage }) {
  const faqs = getLearnFaqs(page.slug);
  const relatedLinks = getLearnRelatedLinks(page.slug);
  const example = articleExamples[page.slug] ?? page.excerpt;

  return (
    <>
      <PageHero eyebrow="Learn" title={page.title} description={page.excerpt}>
        <div className="rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-5 shadow-[0_18px_45px_rgba(55,48,40,0.1)]">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#B86B4B]">
            Plain-language guide
          </p>
          <p className="mt-3 text-sm leading-6 text-[#5F6673]">
            Built for local business owners who want to understand what matters without becoming SEO experts.
          </p>
        </div>
      </PageHero>

      <article className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-10">
            <PlainEnglishBox
              title="The short answer"
              body={`${page.excerpt} The practical goal is to make the next customer feel informed enough to choose you.`}
            />

            <LocalBusinessExample example={example} />

            {page.sections.map((section, index) => (
              <section
                key={section.heading}
                className={
                  index % 2 === 0
                    ? "rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-6"
                    : "rounded-lg border border-[#D8CFC1] bg-[#F8F3EA] p-6 shadow-[6px_6px_0_rgba(36,70,95,0.08)]"
                }
              >
                <h2 className="text-2xl font-semibold text-[#14213D]">{section.heading}</h2>
                <p className="mt-3 text-base leading-7 text-[#5F6673]">{section.body}</p>
                {section.bullets ? (
                  <ul className="mt-5 grid gap-3">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-3 text-sm leading-6 text-[#5F6673]">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-[#7A8463]" aria-hidden="true" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}

            {page.checklist ? (
              <section>
                <h2 className="text-2xl font-semibold text-[#14213D]">Checklist</h2>
                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  {page.checklist.map((group) => (
                    <RetroChecklist key={group.heading} title={group.heading} items={group.items} />
                  ))}
                </div>
              </section>
            ) : null}

            {faqs.length ? (
              <section className="rounded-lg border border-[#D8CFC1] bg-[#FFFDF8] p-6">
                <h2 className="text-2xl font-semibold text-[#14213D]">Common questions</h2>
                <div className="mt-6">
                  <FAQAccordion items={faqs} />
                </div>
              </section>
            ) : null}
          </div>

          <aside className="h-fit space-y-5 lg:sticky lg:top-28">
            <FounderNote>
              These guides are written for owners who need useful context, not a vocabulary test. When a tactic
              matters, it should be clear what it changes for a real customer.
            </FounderNote>
            <div className="rounded-lg border border-[#D8CFC1] bg-[#F8F3EA] p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#B86B4B]">
                Next
              </p>
              <h2 className="mt-3 text-xl font-semibold text-[#14213D]">Turn the lesson into action.</h2>
              <p className="mt-3 text-sm leading-6 text-[#5F6673]">
                Visora brings local SEO, reviews, listings, content, and lead recovery into one dashboard.
              </p>
              <Link
                href="/platform"
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#B86B4B] hover:text-[#B86B4B]"
              >
                See how it works
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              {relatedLinks.length ? (
                <div className="mt-6 border-t border-[#D8CFC1] pt-5">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#B86B4B]">
                    Related resources
                  </h3>
                  <div className="mt-3 grid gap-2">
                    {relatedLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="text-sm font-semibold leading-6 text-[#14213D] underline decoration-[#E6C98F] underline-offset-4 hover:text-[#B86B4B]"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </article>

      <CTASection />
    </>
  );
}
