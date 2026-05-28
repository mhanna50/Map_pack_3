import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LocationSwitcher } from "@/features/tenants/components/location-switcher";
import { getOnboardingAccessState } from "@/features/onboarding/server/onboarding-guard";
import "../globals.css";

export const metadata: Metadata = {
  title: "Map Pack 3 – Dashboard",
};

const navLinks = [
  { href: "/app", label: "Overview" },
  { href: "/app/rankings", label: "Rank Tracking" },
  { href: "/app/reviews", label: "Reviews" },
  { href: "/app/posts", label: "Posts & Media" },
  { href: "/app/competitors", label: "Competitors" },
  { href: "/app/settings", label: "Settings" },
];

const mockLocations = [
  { id: "downtown", name: "Downtown Location", details: "Owner" },
  { id: "uptown", name: "Uptown Service Center", details: "Admin" },
  { id: "suburb", name: "Suburb Install Team", details: "Member" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const access = await getOnboardingAccessState();
  if (!access.signedIn) {
    redirect("/sign-in?redirect=/app");
  }
  if (access.role === "owner_admin") {
    const adminBase = (process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? "http://localhost:3002").replace(/\/$/, "");
    redirect(`${adminBase}/admin`);
  }
  if (access.role !== "client") {
    redirect("/sign-in?redirect=/app&error=invalid_role");
  }
  if (!access.completed) {
    if (access.destination?.startsWith("/account/subscription")) {
      redirect(access.destination);
    }
    const onboardingTarget = access.destination && access.destination.startsWith("/onboarding")
      ? access.destination
      : "/onboarding";
    redirect(onboardingTarget);
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Link href="/" className="text-lg font-semibold">
              Map Pack 3
            </Link>
            <LocationSwitcher orgName="Acme HVAC" locations={mockLocations} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm md:justify-end">
            <button className="rounded-full bg-primary px-4 py-2 font-semibold text-white">Create</button>
            <button className="rounded-full border border-slate-200 p-2 text-slate-500" aria-label="Notifications">
              🔔
            </button>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1">
              <span className="h-7 w-7 rounded-full bg-slate-900 text-center text-sm font-semibold text-white">AC</span>
              <span className="text-xs font-semibold text-slate-600">Owner</span>
            </div>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 md:py-8 lg:flex-row lg:gap-8">
        <aside className="flex gap-2 overflow-x-auto text-sm lg:block lg:w-48 lg:shrink-0 lg:space-y-2 lg:overflow-visible">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block shrink-0 rounded-xl px-4 py-2 text-slate-600 transition hover:bg-slate-100"
            >
              {link.label}
            </Link>
          ))}
        </aside>
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
