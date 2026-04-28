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
  showCaretAfterComplete?: boolean;
  forceHideCaret?: boolean;
  caretClassName?: string;
  caretChar?: string;
};

export function TypewriterText({
  text,
  speed = 34,
  start = true,
  delay = 0,
  className,
  onComplete,
  showCaretAfterComplete = false,
  forceHideCaret = false,
  caretClassName,
  caretChar = "|",
}: Props) {
  const prefersReducedMotion = !!useReducedMotion();
  const [output, setOutput] = useState(prefersReducedMotion ? text : "");
  const [isTyping, setIsTyping] = useState(false);
  const [completed, setCompleted] = useState(prefersReducedMotion);
  const doneRef = useRef<boolean>(false);
  const startedRef = useRef<boolean>(false);
  const frameRef = useRef<number | null>(null);
  const delayRef = useRef<number | null>(null);

  // Reset when text or start changes
  useEffect(() => {
    if (!start || startedRef.current) return;
    startedRef.current = true;

    // If motion is reduced, render after a microtask to avoid sync setState warning
    if (prefersReducedMotion) {
      delayRef.current = window.setTimeout(() => {
        setOutput(text);
        setIsTyping(false);
        setCompleted(true);
        if (!doneRef.current) {
          doneRef.current = true;
          onComplete?.();
        }
      }, 0);
      return () => {
        if (delayRef.current !== null) window.clearTimeout(delayRef.current);
      };
    }

    delayRef.current = window.setTimeout(() => {
      setOutput("");
      setIsTyping(false);
      setCompleted(false);
      doneRef.current = false;

      delayRef.current = window.setTimeout(() => {
        setIsTyping(true);
        let index = 0;
        const typeNext = () => {
          index += 1;
          setOutput(text.slice(0, index));

          if (index >= text.length) {
            setIsTyping(false);
            setCompleted(true);
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
    }, 0);

    return () => {
      if (frameRef.current !== null) window.clearTimeout(frameRef.current);
      if (delayRef.current !== null) window.clearTimeout(delayRef.current);
    };
  }, [start, speed, text, prefersReducedMotion, delay, onComplete]);

  const showCaret = !prefersReducedMotion && !forceHideCaret && (isTyping || (showCaretAfterComplete && completed && start));
  const caretClasses = caretClassName ?? "inline-block w-[0.6ch] animate-pulse";

  return (
    <span className={className}>
      {output}
      {showCaret && <span className={caretClasses}>{caretChar}</span>}
    </span>
  );
}
