"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { motion } from "framer-motion";
import { ChevronDown, Menu, X } from "lucide-react";

import { brand, learnPages, servicePages } from "@/content/marketing";
import { cn } from "@/lib/utils";

function Dropdown({
  label,
  href,
  items,
}: {
  label: string;
  href: string;
  items: { label: string; href: string; description: string }[];
}) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-[#25313c] outline-none transition hover:text-[#a64f32] focus-visible:ring-2 focus-visible:ring-[#d86f45] [&::-webkit-details-marker]:hidden">
        <Link href={href} className="rounded-full focus:outline-none">
          {label}
        </Link>
        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="absolute left-0 top-full z-40 mt-3 w-[min(560px,calc(100vw-2rem))] rounded-lg border border-[#dcc6a4] bg-[#fffaf0] p-3 shadow-[0_24px_60px_rgba(52,45,36,0.18)]">
        <div className="grid gap-1 sm:grid-cols-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 transition hover:bg-[#f4e3c8] focus:outline-none focus:ring-2 focus:ring-[#d86f45]"
            >
              <span className="block text-sm font-semibold text-[#17202e]">{item.label}</span>
              <span className="mt-1 block text-xs leading-5 text-[#647068]">{item.description}</span>
            </Link>
          ))}
        </div>
      </div>
    </details>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const serviceItems = servicePages.map((service) => ({
    label: service.navLabel,
    href: `/services/${service.slug}`,
    description: service.excerpt,
  }));
  const learnItems = learnPages.map((page) => ({
    label: page.navLabel,
    href: `/learn/${page.slug}`,
    description: page.excerpt,
  }));

  const directLinks = [
    { href: "/platform", label: "Platform" },
    { href: "/pricing", label: "Pricing" },
    { href: "/about", label: "About" },
  ];

  return (
    <motion.header
      initial={{ y: -18, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 px-3 pt-3"
    >
      <div className="mx-auto max-w-6xl rounded-lg border border-[#dcc6a4]/80 bg-[#fffaf0]/92 px-4 py-3 shadow-[0_14px_36px_rgba(63,50,36,0.12)] backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-full text-base font-semibold text-[#17202e] focus:outline-none focus:ring-2 focus:ring-[#d86f45]"
          >
            <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-[#d8b56d] bg-[#17202e]">
              <DotLottieReact src="/lottie/earth.lottie" autoplay loop className="h-11 w-11" />
            </span>
            <span>{brand.name}</span>
          </Link>

          <nav className="hidden items-center gap-4 lg:flex" aria-label="Main navigation">
            {directLinks.slice(0, 1).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-2 py-1 text-sm font-semibold transition hover:text-[#a64f32] focus:outline-none focus:ring-2 focus:ring-[#d86f45]",
                  pathname === link.href ? "text-[#a64f32]" : "text-[#25313c]",
                )}
              >
                {link.label}
              </Link>
            ))}
            <Dropdown label="Services" href="/services" items={serviceItems} />
            <Dropdown label="Learn" href="/learn" items={learnItems} />
            {directLinks.slice(1).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-2 py-1 text-sm font-semibold transition hover:text-[#a64f32] focus:outline-none focus:ring-2 focus:ring-[#d86f45]",
                  pathname === link.href ? "text-[#a64f32]" : "text-[#25313c]",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 sm:flex">
            <Link
              href="/contact"
              className="rounded-full bg-[#d86f45] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#bf5f3b] focus:outline-none focus:ring-2 focus:ring-[#d86f45]"
            >
              Book Demo
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-[#c7ad84] px-4 py-2 text-sm font-semibold text-[#25313c] transition hover:border-[#d86f45] focus:outline-none focus:ring-2 focus:ring-[#d86f45]"
            >
              Login
            </Link>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#c7ad84] text-[#17202e] lg:hidden"
            aria-expanded={open}
            aria-label={open ? "Close navigation" : "Open navigation"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open ? (
          <nav className="mt-4 grid gap-3 border-t border-[#ead9bd] pt-4 lg:hidden" aria-label="Mobile navigation">
            {[...directLinks, { href: "/contact", label: "Contact" }, { href: "/login", label: "Login" }].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm font-semibold text-[#17202e] hover:bg-[#f4e3c8]"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <details>
              <summary className="cursor-pointer list-none rounded-md px-3 py-2 text-sm font-semibold text-[#17202e] [&::-webkit-details-marker]:hidden">
                Services
              </summary>
              <div className="grid gap-1 px-3 pb-2">
                <Link href="/services" className="py-2 text-sm text-[#5a665f]" onClick={() => setOpen(false)}>
                  Services overview
                </Link>
                {serviceItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="py-2 text-sm text-[#5a665f]"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </details>
            <details>
              <summary className="cursor-pointer list-none rounded-md px-3 py-2 text-sm font-semibold text-[#17202e] [&::-webkit-details-marker]:hidden">
                Learn
              </summary>
              <div className="grid gap-1 px-3 pb-2">
                <Link href="/learn" className="py-2 text-sm text-[#5a665f]" onClick={() => setOpen(false)}>
                  Learn overview
                </Link>
                {learnItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="py-2 text-sm text-[#5a665f]"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </details>
          </nav>
        ) : null}
      </div>
    </motion.header>
  );
}

