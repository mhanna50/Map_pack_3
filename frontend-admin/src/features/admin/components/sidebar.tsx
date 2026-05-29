"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  LayoutGrid,
  Users,
  Landmark,
  Receipt,
  Link2,
  Activity,
  Shield,
  FileText,
  LifeBuoy,
  HeartPulse,
  Siren,
  PhoneCall,
  Send,
  Star,
  Map,
  Image,
  MessageSquare,
  Globe,
} from "lucide-react";
import { useState, useSyncExternalStore } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    id: "command",
    label: "Command Center",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutGrid },
      { href: "/admin/clients", label: "Clients", icon: Users },
      { href: "/admin/onboarding", label: "Client Invites", icon: Landmark },
    ],
  },
  {
    id: "health",
    label: "Health & Monitoring",
    items: [
      { href: "/admin/module-health", label: "Module Health", icon: HeartPulse },
      { href: "/admin/integration-health", label: "Integration Health", icon: Siren },
      { href: "/admin/usage", label: "Usage", icon: Activity },
      { href: "/admin/audit", label: "Audit", icon: FileText },
    ],
  },
  {
    id: "local-seo",
    label: "Local SEO Services",
    items: [
      { href: "/admin/gbp", label: "GBP Connections", icon: Link2 },
      { href: "/admin/modules/gbp-posting", label: "GBP Posting", icon: Send },
      { href: "/admin/modules/gbp-audits", label: "GBP Audits", icon: Shield },
      { href: "/admin/modules/reviews", label: "Reviews", icon: Star },
      { href: "/admin/modules/citations", label: "Citations", icon: Link2 },
      { href: "/admin/modules/visibility", label: "Rank Tracking", icon: Map },
      { href: "/admin/modules/images", label: "Images", icon: Image },
      { href: "/admin/modules/qa", label: "Q&A", icon: MessageSquare },
      { href: "/admin/modules/website-audits", label: "Website Audits", icon: Globe },
    ],
  },
  {
    id: "revenue-support",
    label: "Revenue & Support",
    items: [
      { href: "/admin/lead-recovery", label: "Lead Recovery", icon: PhoneCall },
      { href: "/admin/billing", label: "Billing", icon: Receipt },
      { href: "/admin/support", label: "Support", icon: LifeBuoy },
    ],
  },
  {
    id: "access",
    label: "Access Control",
    items: [{ href: "/admin/roles", label: "Roles", icon: Shield }],
  },
];

const defaultOpenSections = Object.fromEntries(navSections.map((section) => [section.id, true]));
const sidebarSectionsStorageKey = "admin-sidebar-sections";
const sidebarSectionsChangedEvent = "admin-sidebar-sections-changed";
let cachedOpenSectionsJson = "";
let cachedOpenSections = defaultOpenSections;

const readStoredOpenSections = () => {
  if (typeof window === "undefined") return defaultOpenSections;
  const saved = window.localStorage.getItem(sidebarSectionsStorageKey);
  if (!saved) return defaultOpenSections;
  if (saved === cachedOpenSectionsJson) return cachedOpenSections;
  try {
    const parsed = JSON.parse(saved) as Record<string, boolean>;
    cachedOpenSectionsJson = saved;
    cachedOpenSections = { ...defaultOpenSections, ...parsed };
    return cachedOpenSections;
  } catch {
    window.localStorage.removeItem(sidebarSectionsStorageKey);
    return defaultOpenSections;
  }
};

const subscribeToStoredOpenSections = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener(sidebarSectionsChangedEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(sidebarSectionsChangedEvent, callback);
  };
};

const writeStoredOpenSections = (sections: Record<string, boolean>) => {
  const next = { ...defaultOpenSections, ...sections };
  const serialized = JSON.stringify(next);
  cachedOpenSectionsJson = serialized;
  cachedOpenSections = next;
  window.localStorage.setItem(sidebarSectionsStorageKey, serialized);
  window.dispatchEvent(new Event(sidebarSectionsChangedEvent));
};

const isActiveNavItem = (pathname: string, href: string) =>
  pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const openSections = useSyncExternalStore(
    subscribeToStoredOpenSections,
    readStoredOpenSections,
    () => defaultOpenSections,
  );
  const activeSection = navSections.find((section) =>
    section.items.some((item) => isActiveNavItem(pathname, item.href)),
  );
  const flatNavItems = navSections.flatMap((section) => section.items);

  const toggleSection = (sectionId: string) => {
    writeStoredOpenSections({ ...openSections, [sectionId]: !openSections[sectionId] });
  };

  const navLink = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActiveNavItem(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={cn(
          "flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
          active ? "bg-primary/10 text-primary shadow-inner" : "text-muted-foreground hover:bg-muted/60",
          collapsed && "justify-center",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "flex w-full flex-col rounded-2xl border border-border bg-white/80 p-3 shadow-sm transition-all lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:p-4",
        collapsed ? "lg:w-16" : "lg:w-64",
      )}
    >
      <div className="flex items-center justify-between">
        <div className={cn("text-lg font-semibold", collapsed && "hidden")}>Owner Admin</div>
        <button
          aria-label="Toggle sidebar"
          className="hidden rounded-lg p-1 text-muted-foreground hover:bg-muted/50 lg:inline-flex"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className={cn("mt-4 overflow-y-auto pb-1 lg:mt-6 lg:pb-0", collapsed ? "space-y-1" : "space-y-3")}>
        {collapsed
          ? flatNavItems.map((item) => navLink(item))
          : navSections.map((section) => {
              const sectionActive = activeSection?.id === section.id;
              const sectionOpen = openSections[section.id] ?? true;
              return (
                <section key={section.id} className="space-y-1">
                  <button
                    aria-controls={`admin-nav-${section.id}`}
                    aria-expanded={sectionOpen}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-semibold uppercase text-muted-foreground transition hover:bg-muted/60 hover:text-foreground",
                      sectionActive && "text-foreground",
                    )}
                    onClick={() => toggleSection(section.id)}
                  >
                    <span className="truncate">{section.label}</span>
                    <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !sectionOpen && "-rotate-90")} />
                  </button>
                  {sectionOpen && (
                    <div id={`admin-nav-${section.id}`} className="space-y-1">
                      {section.items.map((item) => navLink(item))}
                    </div>
                  )}
                </section>
              );
            })}
      </nav>

      <div className={cn("mt-auto hidden space-y-3 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground lg:block", collapsed && "lg:hidden")}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Billing sync</p>
        <div className="flex items-center justify-between text-xs">
          <span>Stripe events</span>
          <Badge variant="success">Healthy</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Monitor webhooks and reconcile nightly jobs.</p>
      </div>
    </aside>
  );
}
