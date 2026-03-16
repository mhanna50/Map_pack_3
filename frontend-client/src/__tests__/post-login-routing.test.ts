import {
  normalizePostLoginResolution,
  resolveClientAppDestination,
} from "@/lib/post-login-routing";
import { describe, expect, it } from "vitest";

describe("post-login routing resolver", () => {
  it("routes owner_admin users to /admin", () => {
    const resolution = normalizePostLoginResolution({
      role: "owner_admin",
      destination: "/dashboard",
      onboarding_complete: true,
    });

    expect(resolution.role).toBe("owner_admin");
    expect(resolution.destination).toBe("/admin");
  });

  it("routes client users with completed onboarding to /dashboard", () => {
    const resolution = normalizePostLoginResolution({
      role: "client",
      destination: "/onboarding?step=finish",
      onboarding_complete: true,
      next_step: "done",
    });

    expect(resolution.role).toBe("client");
    expect(resolution.onboardingComplete).toBe(true);
    expect(resolveClientAppDestination(resolution)).toBe("/dashboard");
  });

  it("routes client users with incomplete onboarding to their next step", () => {
    const resolution = normalizePostLoginResolution({
      role: "client",
      destination: "/onboarding?step=business_setup",
      onboarding_complete: false,
      next_step: "business_setup",
    });

    expect(resolution.role).toBe("client");
    expect(resolution.onboardingComplete).toBe(false);
    expect(resolveClientAppDestination(resolution)).toBe("/onboarding?step=business_setup");
  });

  it("fails safely for invalid role payloads", () => {
    const resolution = normalizePostLoginResolution({
      role: "something_else",
      destination: "/dashboard",
    });

    expect(resolution.role).toBe("invalid");
    expect(resolution.destination).toBe("/sign-in?error=invalid_role");
  });

  it("does not allow non-admin users to resolve to /admin", () => {
    const resolution = normalizePostLoginResolution({
      role: "client",
      destination: "/admin",
      onboarding_complete: false,
      next_step: "account",
    });

    expect(resolution.role).toBe("client");
    expect(resolution.destination).toBe("/onboarding?step=google_profile");
  });

  it("does not route invalid users to client dashboard", () => {
    const resolution = normalizePostLoginResolution(null);
    expect(resolveClientAppDestination(resolution)).toBe("/sign-in?error=invalid_role");
  });

  it("preserves onboarding resume steps across multiple states", () => {
    const steps = ["google_profile", "business_info", "services", "stripe"];

    for (const step of steps) {
      const resolution = normalizePostLoginResolution({
        role: "client",
        destination: `/onboarding?step=${step}`,
        onboarding_complete: false,
        next_step: step,
      });

      expect(resolveClientAppDestination(resolution)).toBe(`/onboarding?step=${step}`);
    }
  });

  it("maps legacy next_step values to the new onboarding step names", () => {
    const resolution = normalizePostLoginResolution({
      role: "client",
      destination: "/dashboard",
      onboarding_complete: false,
      next_step: "billing",
    });

    expect(resolution.nextStep).toBe("services");
    expect(resolution.destination).toBe("/onboarding?step=services");
  });

  it("supports redirect override only when onboarding is complete", () => {
    const complete = normalizePostLoginResolution({
      role: "client",
      destination: "/dashboard",
      onboarding_complete: true,
      next_step: "done",
    });
    const incomplete = normalizePostLoginResolution({
      role: "client",
      destination: "/onboarding?step=google",
      onboarding_complete: false,
      next_step: "google",
    });

    expect(resolveClientAppDestination(complete, "/app/settings")).toBe("/app/settings");
    expect(resolveClientAppDestination(incomplete, "/app/settings")).toBe("/onboarding?step=google");
  });
});
