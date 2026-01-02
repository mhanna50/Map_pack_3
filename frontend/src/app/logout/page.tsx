"use client";

import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";

export default function LogoutPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm space-y-6 rounded-3xl bg-white p-8 text-center shadow-sm">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Account</p>
        <h1 className="text-2xl font-semibold text-slate-900">Sign out</h1>
        <p className="text-sm text-slate-600">You can log back in anytime to manage automations.</p>
        <SignOutButton>
          <button className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">Sign out</button>
        </SignOutButton>
        <Link href="/app" className="block text-sm font-semibold text-primary">
          Cancel and return to dashboard
        </Link>
      </div>
    </div>
  );
}
