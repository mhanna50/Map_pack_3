import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import OnboardingPage from "@/app/onboarding/page";

process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_dummy";

const mockUpdateUser = vi.fn().mockResolvedValue({ error: null });

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: ReactNode }) => <>{children}</>,
  PaymentElement: () => <div>Payment form</div>,
  useStripe: () => ({ confirmPayment: vi.fn().mockResolvedValue({}) }),
  useElements: () => ({}),
}));

const push = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("@/lib/supabase/session", () => ({
  getAccessToken: vi.fn().mockResolvedValue("fake-token"),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1", email: "test@example.com" } } }),
      updateUser: mockUpdateUser,
      setSession: vi.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}));

const fetchMock = vi.fn((url: string) => {
  if (url.endsWith("/billing/subscribe")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ client_secret: "secret", subscription_id: "sub_123" }),
    });
  }
  if (url.includes("/api/onboarding/save")) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ saved: true }) });
  }
  if (url.includes("/api/onboarding/claim")) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ tenant_id: "tenant_1", business_name: "Acme HVAC" }) });
  }
  if (url.endsWith("/orgs/")) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: "org_123" }) });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
});

describe("Onboarding flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  const completeStepZero = async () => {
    const savePasswordButton = await screen.findByRole("button", { name: /save password/i });
    fireEvent.change(screen.getByPlaceholderText(/at least 8 characters/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByPlaceholderText(/re-enter password/i), { target: { value: "password123" } });
    await waitFor(() => expect(savePasswordButton).toBeEnabled());
    fireEvent.click(savePasswordButton);
  };

  it("lets invited users set a password and move to business setup", async () => {
    render(<OnboardingPage />);

    await completeStepZero();

    const businessSetup = await screen.findAllByText(/Business setup/i);
    expect(businessSetup.length).toBeGreaterThan(0);
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "password123" });
    const passwordSaveCall = fetchMock.mock.calls.some((call: [string, RequestInit?]) => {
      const [url, options] = call;
      if (typeof url !== "string" || !url.includes("/api/onboarding/save")) return false;
      const body = options?.body;
      if (typeof body !== "string") return false;
      try {
        const parsed = JSON.parse(body) as { password_set?: boolean; status?: string };
        return parsed.password_set === true && parsed.status === "in_progress";
      } catch {
        return false;
      }
    });
    expect(passwordSaveCall).toBe(true);
  });

  it("moves from business setup to the Stripe step without errors", async () => {
    render(<OnboardingPage />);

    await completeStepZero();
    await screen.findAllByText(/Business setup/i);
    expect(screen.queryByText(/Business setup is saved for this account/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Acme HVAC/i), { target: { value: "Acme HVAC LLC" } });

    const continueButton = await screen.findByRole("button", { name: /continue/i });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);

    await screen.findByText(/Sign up for Stripe/i);
    await waitFor(() => {
      const billingCallSeen = fetchMock.mock.calls.some(
        ([url]) => typeof url === "string" && url.endsWith("/billing/subscribe"),
      );
      expect(billingCallSeen).toBe(true);
    });
    expect(screen.getByText(/Awaiting payment/i)).toBeInTheDocument();
  });

  it("shows payment received and waits for manual continue when no payment method is required", async () => {
    const noPaymentFetch = vi.fn((url: string) => {
      if (url.endsWith("/billing/subscribe")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ client_secret: null, subscription_id: "sub_trial", requires_payment_method: false }),
        });
      }
      if (url.includes("/api/onboarding/save")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ saved: true }) });
      }
      if (url.includes("/api/onboarding/claim")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tenant_id: "tenant_1", business_name: "Acme HVAC", status: "business_setup" }),
        });
      }
      if (url.endsWith("/orgs/")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: "org_123" }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    global.fetch = noPaymentFetch as unknown as typeof fetch;

    render(<OnboardingPage />);

    await screen.findAllByText(/Business setup/i);
    fireEvent.change(screen.getByPlaceholderText(/Acme HVAC/i), { target: { value: "Acme HVAC LLC" } });

    const continueButton = await screen.findByRole("button", { name: /continue/i });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);

    await screen.findByText(/Payment received\./i);
    expect(screen.queryByText(/Payment form/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Your full legal name/i), {
      target: { value: "Test User" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /I agree to these billing terms/i }));

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await screen.findByText(/Connect Google Business Profile/i);
  });

  it("locks completed users to a dashboard handoff screen without back navigation", async () => {
    const activatedFetch = vi.fn((url: string) => {
      if (url.endsWith("/billing/subscribe")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ client_secret: "secret", subscription_id: "sub_123" }),
        });
      }
      if (url.includes("/api/onboarding/save")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ saved: true }) });
      }
      if (url.includes("/api/onboarding/claim")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tenant_id: "tenant_1", business_name: "Acme HVAC", status: "activated" }),
        });
      }
      if (url.endsWith("/orgs/")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: "org_123" }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    global.fetch = activatedFetch as unknown as typeof fetch;

    render(<OnboardingPage />);

    await screen.findByText(/Your account setup is finished/i);
    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
    const finishButton = await screen.findByRole("button", { name: /go to dashboard/i });
    fireEvent.click(finishButton);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/dashboard");
      expect(refresh).toHaveBeenCalled();
    });

    const completedSaveCall = activatedFetch.mock.calls.some((call: [string, RequestInit?]) => {
      const [url, options] = call;
      if (typeof url !== "string" || !url.includes("/api/onboarding/save")) return false;
      const body = options?.body;
      if (typeof body !== "string") return false;
      try {
        return JSON.parse(body).status === "completed";
      } catch {
        return false;
      }
    });
    expect(completedSaveCall).toBe(false);
  });

  it("rehydrates business and agreement fields from persisted draft data", async () => {
    const hydratedFetch = vi.fn((url: string) => {
      if (url.includes("/api/onboarding/claim")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              tenant_id: "tenant_1",
              business_name: "Acme HVAC",
              first_name: "Alex",
              last_name: "Reyes",
              status: "stripe_started",
              onboarding_draft: {
                industrySearch: "Plumber",
                orgInfo: {
                  industry: "Plumber",
                  primaryLocation: "Austin, TX",
                  secondaryLocations: ["Round Rock, TX", "", ""],
                },
                agreementAccepted: true,
                agreementSignature: "Alex Reyes",
                passwordSetAt: "2026-01-01T00:00:00.000Z",
              },
            }),
        });
      }
      if (url.endsWith("/billing/subscribe")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ client_secret: null, subscription_id: "sub_trial", requires_payment_method: false }),
        });
      }
      if (url.includes("/orgs/tenant_1")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ metadata_json: { onboarding_draft: { agreementAccepted: true, agreementSignature: "Alex Reyes" } } }),
        });
      }
      if (url.includes("/api/onboarding/save")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ saved: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    global.fetch = hydratedFetch as unknown as typeof fetch;

    render(<OnboardingPage />);

    await screen.findByText(/Sign up for Stripe/i);
    const signatureInput = screen.getByPlaceholderText(/Your full legal name/i) as HTMLInputElement;
    expect(signatureInput.value).toBe("Alex Reyes");
    const termsCheckbox = screen.getByRole("checkbox", {
      name: /I agree to these billing terms/i,
    }) as HTMLInputElement;
    expect(termsCheckbox.checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    await screen.findAllByText(/Business setup/i);
    expect((screen.getByPlaceholderText(/Acme HVAC/i) as HTMLInputElement).value).toBe("Acme HVAC");
    expect((screen.getByPlaceholderText(/Alex/i) as HTMLInputElement).value).toBe("Alex");
    expect((screen.getByPlaceholderText(/Reyes/i) as HTMLInputElement).value).toBe("Reyes");
    expect((screen.getByPlaceholderText("Enter: City") as HTMLInputElement).value).toBe("Austin");
    expect((screen.getByPlaceholderText("Enter: State") as HTMLInputElement).value).toBe("TX");
    expect((screen.getByPlaceholderText(/Enter: City 1/i) as HTMLInputElement).value).toBe("Round Rock");
    expect((screen.getByPlaceholderText(/Enter: State 1/i) as HTMLInputElement).value).toBe("TX");
  });
});
