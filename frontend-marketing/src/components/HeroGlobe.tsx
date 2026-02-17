"use client";

import { useEffect, useMemo, useState } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { motion, useReducedMotion } from "framer-motion";

type InfoDot = {
  top: string;
  left: string;
  label: string;
  side?: "left" | "right";
};

type Props = {
  className?: string;
  animateDown?: boolean;
  dimmed?: boolean;
  showInfo?: boolean;
};

// Renders the dotLottie globe and handles responsive sizing + motion + info pins.
export function HeroGlobe({ className, animateDown, dimmed = false, showInfo = false }: Props) {
  const prefersReducedMotion = !!useReducedMotion();
  const [ready, setReady] = useState(false);
  const [pinsVisible, setPinsVisible] = useState(false);

  const pins: InfoDot[] = useMemo(
    () => [
      { top: "32%", left: "44%", label: "Set up in under 10 minutes", side: "right" },
      { top: "48%", left: "56%", label: "No contracts. Cancel anytime.", side: "right" },
      { top: "40%", left: "68%", label: "Unified review inbox", side: "left" },
      { top: "62%", left: "50%", label: "Auto-review requests (SMS/Email)", side: "left" },
      { top: "54%", left: "34%", label: "Real-time Google sync", side: "right" },
      { top: "70%", left: "60%", label: "Built by engineers, not marketers", side: "left" },
    ],
    []
  );

  useEffect(() => {
    // Defer mount a tick so initial layout matches centered state
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(
      () => setPinsVisible(!!showInfo),
      showInfo ? (prefersReducedMotion ? 0 : 800) : 0
    );
    return () => window.clearTimeout(id);
  }, [showInfo, prefersReducedMotion]);

  const dropOffset = "calc(40vh + 140px)"; // 40px closer to the bottom than before
  const targetY = !ready ? 0 : prefersReducedMotion ? dropOffset : animateDown ? dropOffset : 0;
  const targetFilter = dimmed ? "grayscale(0.9) brightness(0.45) contrast(0.92)" : "none";

  return (
    <motion.div
      className={className}
      initial={{ y: 0, filter: targetFilter }}
      animate={{ y: targetY, filter: targetFilter }}
      transition={{
        duration: prefersReducedMotion ? 0 : animateDown ? 1.4 : 0.001,
        ease: [0.16, 1, 0.3, 1],
      }}
      style={{
        pointerEvents: "auto",
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1,
      }}
    >
      <div
        className="relative"
        style={{
          // 30% larger than previous clamp while keeping responsive bounds
          width: "clamp(507px, 95vw, 2106px)",
          maxWidth: "2106px",
          minWidth: "507px",
        }}
      >
        <DotLottieReact
          src="/lottie/earth.lottie" // using public asset for Next.js static serving
          className="w-full h-auto"
          autoplay
          loop
        />
        <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-radial from-sky-500/12 via-transparent to-transparent blur-3xl" />

        {pinsVisible && (
          <div className="absolute inset-0 pointer-events-none">
            {pins.map((pin, index) => (
              <div
                key={`${pin.label}-${index}`}
                className="group absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto relative"
                style={{ top: pin.top, left: pin.left }}
              >
                <span className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25 opacity-60 blur-[2px] animate-ping" />
                <span className="relative grid h-4 w-4 place-items-center rounded-full bg-white shadow-[0_0_25px_rgba(255,255,255,0.7)] cursor-pointer" />
                <div
                  className={`pointer-events-auto absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-slate-900 shadow-xl transition-all duration-200 ease-out ${
                    pin.side === "left"
                      ? "right-6 origin-right translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
                      : "left-6 origin-left -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
                  }`}
                >
                  {pin.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
