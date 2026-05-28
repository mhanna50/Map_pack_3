import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-site min-h-screen overflow-x-hidden bg-[#F8F3EA] text-[#14213D]">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

