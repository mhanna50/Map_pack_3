"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

type HeaderProps = {
  show: boolean;
};

export function Header({ show }: HeaderProps) {
  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={show ? { y: 0, opacity: 1 } : { y: -30, opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto fixed inset-x-0 top-0 z-30 w-full"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl border-b border-white/10 bg-white/4 px-5 py-4 text-sm text-slate-100 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 text-base font-semibold text-white">
            <div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-black/40">
              <DotLottieReact src="/lottie/earth.lottie" autoplay loop className="h-10 w-10" />
            </div>
            Map Pack 3
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            <a href="#product" className="transition hover:text-sky-300">
              Product
            </a>
            <a href="#pricing" className="transition hover:text-sky-300">
              Pricing
            </a>
            <a href="#trust" className="transition hover:text-sky-300">
              Proof
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="rounded-full border border-white/15 px-4 py-2 text-slate-100 hover:border-sky-400/60">
            Login
          </Link>
          <a
            href="#contact"
            className="hidden rounded-full bg-gradient-to-r from-indigo-600 to-sky-500 px-4 py-2 text-white shadow-lg shadow-sky-900/40 transition hover:from-indigo-500 hover:to-sky-400 sm:inline-flex"
          >
            Request access
          </a>
        </div>
      </div>
    </motion.header>
  );
}
