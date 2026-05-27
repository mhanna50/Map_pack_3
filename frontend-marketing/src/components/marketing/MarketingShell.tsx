import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-site min-h-screen overflow-x-hidden bg-[#f8f1e3] text-[#17202e]">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

