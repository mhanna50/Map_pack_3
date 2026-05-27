import Link from "next/link";

import { brand, learnPages, servicePages } from "@/content/marketing";

const footerGroups = [
  {
    heading: "Platform",
    links: [
      { label: "Overview", href: "/platform" },
      { label: "Pricing", href: "/pricing" },
      { label: "FAQ", href: "/faq" },
      { label: "Book Demo", href: "/contact" },
    ],
  },
  {
    heading: "Services",
    links: [
      { label: "Services overview", href: "/services" },
      ...servicePages.slice(0, 7).map((service) => ({
        label: service.navLabel,
        href: `/services/${service.slug}`,
      })),
    ],
  },
  {
    heading: "Learn",
    links: [
      { label: "Learn overview", href: "/learn" },
      ...learnPages.slice(0, 6).map((page) => ({
        label: page.navLabel,
        href: `/learn/${page.slug}`,
      })),
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Support", href: "/support" },
      { label: "Login", href: "/login" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Security", href: "/security" },
      { label: "Cookies", href: "/cookies" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[#d9c4a4] bg-[#17202e] px-6 py-12 text-[#fff8ec]">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.3fr_2fr]">
        <div className="space-y-4">
          <Link href="/" className="text-2xl font-semibold">
            {brand.name}
          </Link>
          <p className="max-w-sm text-sm leading-6 text-[#dcd2bd]">
            AI-assisted local visibility software for businesses that want to get found, look trustworthy,
            stay consistent, and recover more leads.
          </p>
          <p className="text-sm leading-6 text-[#c7bda8]">
            Support:{" "}
            <a className="underline underline-offset-4 hover:text-white" href={`mailto:${brand.email}`}>
              {brand.email}
            </a>
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {footerGroups.map((group) => (
            <div key={group.heading}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e7b35f]">
                {group.heading}
              </h2>
              <ul className="mt-4 space-y-2">
                {group.links.map((link) => (
                  <li key={`${group.heading}-${link.href}`}>
                    <Link className="text-sm text-[#dcd2bd] hover:text-white" href={link.href}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-6xl border-t border-white/10 pt-5 text-xs text-[#c7bda8]">
        Copyright {new Date().getFullYear()} {brand.name}. Draft legal pages should be reviewed before production use.
      </div>
    </footer>
  );
}

