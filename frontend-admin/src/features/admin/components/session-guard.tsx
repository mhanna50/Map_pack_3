"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

const SESSION_STARTED_KEY = "visora:admin:session_started_at";
const LAST_ACTIVITY_KEY = "visora:admin:last_activity_at";
const USER_KEY = "visora:admin:user_id";
const ACTIVITY_THROTTLE_MS = 15_000;

function minutesFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hoursFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function redirectToSignIn(reason: "inactive" | "expired" | "signed_out") {
  const redirect = `${window.location.pathname}${window.location.search}`;
  const url = new URL("/sign-in", window.location.origin);
  url.searchParams.set("redirect", redirect || "/admin");
  url.searchParams.set("reason", reason);
  window.location.replace(url.toString());
}

export function AdminSessionGuard({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const signingOutRef = useRef(false);
  const lastActivityWriteRef = useRef(0);
  const idleTimeoutMs = minutesFromEnv(process.env.NEXT_PUBLIC_ADMIN_SESSION_IDLE_TIMEOUT_MINUTES, 30) * 60 * 1000;
  const maxSessionAgeMs = hoursFromEnv(process.env.NEXT_PUBLIC_ADMIN_SESSION_MAX_AGE_HOURS, 12) * 60 * 60 * 1000;

  const signOut = useCallback(
    async (reason: "inactive" | "expired" | "signed_out") => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      window.localStorage.removeItem(SESSION_STARTED_KEY);
      window.localStorage.removeItem(LAST_ACTIVITY_KEY);
      window.localStorage.removeItem(USER_KEY);
      await supabase.auth.signOut();
      redirectToSignIn(reason);
    },
    [supabase],
  );

  const markActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityWriteRef.current < ACTIVITY_THROTTLE_MS) return;
    lastActivityWriteRef.current = now;
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  }, []);

  const checkSessionAge = useCallback(async () => {
    const now = Date.now();
    const startedAt = Number(window.localStorage.getItem(SESSION_STARTED_KEY) || "0");
    const lastActivityAt = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY) || "0");
    if (startedAt && now - startedAt > maxSessionAgeMs) {
      await signOut("expired");
      return;
    }
    if (lastActivityAt && now - lastActivityAt > idleTimeoutMs) {
      await signOut("inactive");
    }
  }, [idleTimeoutMs, maxSessionAgeMs, signOut]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      if (!session?.user) {
        redirectToSignIn("signed_out");
        return;
      }
      const now = Date.now();
      const storedUser = window.localStorage.getItem(USER_KEY);
      if (storedUser !== session.user.id || !window.localStorage.getItem(SESSION_STARTED_KEY)) {
        window.localStorage.setItem(USER_KEY, session.user.id);
        window.localStorage.setItem(SESSION_STARTED_KEY, String(now));
      }
      if (!window.localStorage.getItem(LAST_ACTIVITY_KEY)) {
        window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      }
      await checkSessionAge();
    };
    void initialize();
    return () => {
      active = false;
    };
  }, [checkSessionAge, supabase]);

  useEffect(() => {
    const events = ["click", "keydown", "mousemove", "scroll", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, markActivity, { passive: true }));
    const onFocus = () => {
      void checkSessionAge();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const interval = window.setInterval(() => {
      void checkSessionAge();
    }, 60_000);
    return () => {
      events.forEach((event) => window.removeEventListener(event, markActivity));
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(interval);
    };
  }, [checkSessionAge, markActivity]);

  return children;
}
