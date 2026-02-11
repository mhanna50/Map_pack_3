"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

type Props = {
  text: string;
  speed?: number; // ms per character
  start?: boolean;
  delay?: number; // optional delay before typing starts
  className?: string;
  onComplete?: () => void;
};

export function TypewriterText({
  text,
  speed = 34,
  start = true,
  delay = 0,
  className,
  onComplete,
}: Props) {
  const prefersReducedMotion = !!useReducedMotion();
  const [output, setOutput] = useState(prefersReducedMotion ? text : "");
  const [isTyping, setIsTyping] = useState(false);
  const doneRef = useRef<boolean>(false);
  const frameRef = useRef<number | null>(null);
  const delayRef = useRef<number | null>(null);

  // Reset when text or start changes
  useEffect(() => {
    if (!start) return;

    // If motion is reduced, render immediately
    if (prefersReducedMotion) {
      if (!doneRef.current) {
        doneRef.current = true;
        onComplete?.();
      }
      return;
    }

    delayRef.current = window.setTimeout(() => {
      setIsTyping(true);
      let index = 0;
      const typeNext = () => {
        index += 1;
        setOutput(text.slice(0, index));

        if (index >= text.length) {
          setIsTyping(false);
          if (!doneRef.current) {
            doneRef.current = true;
            onComplete?.();
          }
          return;
        }

        frameRef.current = window.setTimeout(typeNext, speed);
      };

      typeNext();
    }, delay);

    return () => {
      if (frameRef.current !== null) window.clearTimeout(frameRef.current);
      if (delayRef.current !== null) window.clearTimeout(delayRef.current);
    };
  }, [start, speed, text, prefersReducedMotion, delay, onComplete]);

  return (
    <span className={className}>
      {output}
      {isTyping && <span className="inline-block w-[0.6ch] animate-pulse">|</span>}
    </span>
  );
}
