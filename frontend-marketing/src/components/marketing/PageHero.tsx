import { RetroBadge } from "@/components/marketing/RetroBadge";
import { cn } from "@/lib/utils";

export function PageHero({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("relative overflow-hidden px-6 pb-16 pt-32 md:pb-20", className)}>
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,#fbf4e8_0%,#f5ead8_100%)]" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-px bg-[#d9c4a4]" />
      <div
        className={cn(
          "mx-auto grid max-w-6xl gap-10",
          children ? "md:grid-cols-[1.05fr_0.95fr] md:items-end" : "",
        )}
      >
        <div className={cn("max-w-3xl space-y-5", !children && "mx-auto text-center")}>
          {eyebrow ? <RetroBadge>{eyebrow}</RetroBadge> : null}
          <h1 className="text-balance text-4xl font-semibold leading-[1.04] text-[#17202e] md:text-6xl">
            {title}
          </h1>
          <p className="text-pretty text-lg leading-8 text-[#4f5d58] md:text-xl">{description}</p>
        </div>
        {children ? <div className="md:justify-self-end">{children}</div> : null}
      </div>
    </section>
  );
}
