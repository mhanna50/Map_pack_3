import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { PageHero } from "@/components/marketing/PageHero";
import { CTASection } from "@/components/marketing/CTASection";
import type { LearnPage } from "@/content/marketing";

export function LearnArticleLayout({ page }: { page: LearnPage }) {
  return (
    <>
      <PageHero eyebrow="Learn" title={page.title} description={page.excerpt}>
        <div className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-5 shadow-[0_18px_45px_rgba(55,48,40,0.1)]">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8a4b31]">
            Plain-language guide
          </p>
          <p className="mt-3 text-sm leading-6 text-[#5a665f]">
            Built for local business owners who want to understand what matters without becoming SEO experts.
          </p>
        </div>
      </PageHero>

      <article className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-10">
            {page.sections.map((section) => (
              <section key={section.heading} className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-6">
                <h2 className="text-2xl font-semibold text-[#17202e]">{section.heading}</h2>
                <p className="mt-3 text-base leading-7 text-[#53605a]">{section.body}</p>
                {section.bullets ? (
                  <ul className="mt-5 grid gap-3">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-3 text-sm leading-6 text-[#3f4a45]">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-[#6f7f49]" aria-hidden="true" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}

            {page.checklist ? (
              <section className="rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-6">
                <h2 className="text-2xl font-semibold text-[#17202e]">Checklist</h2>
                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  {page.checklist.map((group) => (
                    <div key={group.heading}>
                      <h3 className="font-semibold text-[#17202e]">{group.heading}</h3>
                      <ul className="mt-3 space-y-2">
                        {group.items.map((item) => (
                          <li key={item} className="flex gap-2 text-sm leading-6 text-[#53605a]">
                            <Check className="mt-1 h-4 w-4 shrink-0 text-[#6f7f49]" aria-hidden="true" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="h-fit rounded-lg border border-[#dcc6a4] bg-[#f5e8d1] p-5 lg:sticky lg:top-28">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8a4b31]">
              Next
            </p>
            <h2 className="mt-3 text-xl font-semibold text-[#17202e]">Turn the lesson into action.</h2>
            <p className="mt-3 text-sm leading-6 text-[#5a665f]">
              Visora brings local SEO, reviews, listings, content, and lead recovery into one dashboard.
            </p>
            <Link
              href="/platform"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#8a4b31] hover:text-[#d86f45]"
            >
              See how it works
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </article>

      <CTASection />
    </>
  );
}

