"use client";

import { useState } from "react";
import { BeamCanvas } from "@/components/BeamCanvas";

type HeroProps = {
  headline?: string;
  subheadline?: string;
  imageSrc?: string;
};

export function Hero({
  headline = "Automate Your Google Business Profile",
  subheadline = "Posts, reviews, and reporting—running for every location on autopilot.",
  imageSrc = "/dashboard-placeholder.png",
}: HeroProps) {
  const [imageError, setImageError] = useState(false);
  const showImage = imageSrc && !imageError;

  return (
    <section className="relative w-full overflow-hidden bg-[#020617] px-5 py-14 text-white lg:px-10 lg:py-24">
      <div className="mx-auto mt-[10vh] flex max-w-6xl flex-col items-start text-left">
        <div className="relative z-20 w-full max-w-3xl space-y-5 pl-2 sm:pl-6 lg:pl-10">
          <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">{headline}</h1>
          <p className="text-base text-[rgba(229,231,235,0.72)] sm:text-lg">{subheadline}</p>
          <a
            href="#contact"
            className="inline-flex items-center justify-center rounded-full border border-[rgba(56,189,248,0.35)] bg-[rgba(30,58,138,0.35)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(29,78,216,0.2)] transition hover:bg-[rgba(29,78,216,0.5)] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]"
          >
            Schedule a call
          </a>
        </div>

        <div className="relative mt-12 w-full max-w-5xl self-center">
          {/* Glow layers (behind the dashboard preview) */}
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div
              className="absolute inset-[-12%] rounded-[32px] blur-3xl"
              style={{
                background:
                  "radial-gradient(60% 60% at 50% 50%, rgba(30,58,138,0.35), rgba(2,6,23,0) 70%)",
              }}
            />
            <div
              className="absolute inset-[-6%] rounded-[24px] blur-2xl"
              style={{
                background:
                  "radial-gradient(65% 65% at 50% 55%, rgba(29,78,216,0.35), rgba(2,6,23,0) 65%)",
              }}
            />
          </div>

          <div className="relative">
            {/* WebGL beam layer (separate, below the dashboard image) */}
            <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
              <BeamCanvas />
            </div>
            <div
              className="relative z-10 rounded-3xl p-[1.5px]"
              style={{
                background:
                  "linear-gradient(180deg, rgba(56,189,248,0.75) 0%, rgba(30,58,138,0) 45%), linear-gradient(90deg, rgba(30,58,138,0.9) 0%, rgba(30,58,138,0.7) 35%, rgba(30,58,138,0.7) 65%, rgba(30,58,138,0.9) 100%)",
              }}
            >
              <div className="overflow-hidden rounded-3xl bg-[#05070f] shadow-[0_30px_80px_rgba(2,6,23,0.65)]">
                {showImage ? (
                  <img
                    src={imageSrc}
                    alt="Dashboard preview"
                    className="h-full w-full object-cover"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div
                    className="aspect-[16/9] w-full"
                    style={{
                      backgroundColor: "#0b1220",
                      backgroundImage:
                        "linear-gradient(rgba(56,189,248,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.08) 1px, transparent 1px)",
                      backgroundSize: "48px 48px",
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
