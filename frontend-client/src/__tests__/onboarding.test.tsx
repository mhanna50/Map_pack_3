import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingPage from "@/app/onboarding/page";

const mockSupabaseUser: { id: string; email: string; user_metadata: Record<string, unknown> } = {
  id: "u1",
  email: "test@example.com",
  user_metadata: {},
};
const mockGetUser = vi.fn().mockImplementation(() =>
  Promise.resolve({ data: { user: mockSupabaseUser } }),
);
const mockSignOut = vi.fn().mockResolvedValue({ error: null });

const push = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();
const getSearchParam = vi.fn((key: string) => (key ? null : null) as string | null);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh }),
  useSearchParams: () => ({ get: getSearchParam }),
}));

vi.mock("@/lib/supabase/session", () => ({
  getAccessToken: vi.fn().mockResolvedValue("fake-token"),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
      signOut: mockSignOut,
      setSession: vi.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}));

type MockConfig = {
  claim: Record<string, unknown>;
  billing: {
    checkout_url: string;
    session_id: string;
  };
  serviceDescription: string;
};

const defaultClaim = (): Record<string, unknown> => ({
  tenant_id: "tenant_1",
  business_name: "Acme HVAC",
  first_name: "",
  last_name: "",
  status: "in_progress",
  onboarding_draft: null,
});

const makeFetchMock = (configOverrides?: Partial<MockConfig>) => {
  const config: MockConfig = {
    claim: defaultClaim(),
    billing: {
      checkout_url: "https://checkout.stripe.test/session",
      session_id: "cs_test_123",
    },
    serviceDescription: "Professional duct cleaning that improves airflow and indoor comfort with clear scheduling and dependable service.",
    ...configOverrides,
  };

  const saveCalls: Array<Record<string, unknown>> = [];

  const mock = vi.fn((url: string, options?: RequestInit) => {
    if (url.includes("/api/onboarding/claim")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(config.claim),
      });
    }

    if (url.includes("/orgs/tenant_1") && (options?.method === "GET" || !options?.method)) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ metadata_json: {} }),
      });
    }

    if (url.includes("/google/oauth/start")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ authorization_url: "https://example.test/google-auth" }),
      });
    }

    if (url.includes("/google/accounts?organization_id=tenant_1")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: "acc_1",
              display_name: "Acme GBP",
              external_account_id: "accounts/12345",
            },
          ]),
      });
    }

    if (url.includes("/google/accounts/acc_1/locations/connect")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: "loc_1" }),
      });
    }

    if (url.includes("/google/accounts/acc_1/locations")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              name: "accounts/12345/locations/abc",
              title: "Acme HVAC - Austin",
              store_code: "AUS-01",
              metadata: {
                title: "Acme HVAC",
                websiteUri: "https://acmehvac.example",
                storefrontAddress: {
                  locality: "Austin",
                  administrativeArea: "TX",
                },
                categories: {
                  primaryCategory: { displayName: "HVAC contractor" },
                  additionalCategories: [{ displayName: "Air duct cleaning service" }],
                },
              },
            },
            {
              name: "accounts/12345/locations/xyz",
              title: "Acme HVAC - Round Rock",
              store_code: "RR-02",
              metadata: {
                title: "Acme HVAC",
              },
            },
          ]),
      });
    }

    if (url.includes("/api/onboarding/services/generate-description")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ description: config.serviceDescription }),
      });
    }

    if (url.endsWith("/billing/checkout")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(config.billing),
      });
    }

    if (url.includes("/api/onboarding/save")) {
      const body =
        typeof options?.body === "string"
          ? (JSON.parse(options.body) as Record<string, unknown>)
          : {};
      saveCalls.push(body);
      const status = typeof body.status === "string" ? body.status : "in_progress";
      const resumeStepByStatus: Record<string, number> = {
        in_progress: 0,
        business_setup: 1,
        stripe_pending: 2,
        stripe_started: 2,
        google_pending: 2,
        completed: 2,
        activated: 2,
      };
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            saved: true,
            status,
            resume_step: resumeStepByStatus[status] ?? 0,
            pending: {
              status,
              tenant_id: "tenant_1",
              onboarding_draft: body.onboarding_draft ?? null,
            },
          }),
      });
    }

    if (url.endsWith("/orgs/")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: "tenant_1" }),
      });
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });

  return { mock, saveCalls };
};

describe("Onboarding flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseUser.id = "u1";
    mockSupabaseUser.email = "test@example.com";
    mockSupabaseUser.user_metadata = {};
    sessionStorage.clear();
    localStorage.clear();
    getSearchParam.mockImplementation(() => null);
  });

  it("collects first/last name, connects/selects GBP, and saves step 1", async () => {
    const { mock: fetchMock, saveCalls } = makeFetchMock();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<OnboardingPage />);

    await screen.findByRole("heading", { name: /Google login \+ profile/i });
    fireEvent.change(screen.getByPlaceholderText("Alex"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByPlaceholderText("Reyes"), { target: { value: "Reyes" } });

    await screen.findByText(/Choose your primary GBP location/i);
    fireEvent.click(screen.getByRole("button", { name: /Use selected location/i }));
    await screen.findByText(/Connected:/i);

    fireEvent.click(screen.getByRole("button", { name: /^Continue$/i }));
    await screen.findByText(/Confirm business info \+ brand voice/i);

    const stepOneSave = saveCalls.find((call) => call.status === "business_setup");
    expect(stepOneSave).toBeDefined();
    expect(stepOneSave?.first_name).toBe("Alex");
    expect(stepOneSave?.last_name).toBe("Reyes");

    const connectedLocationCallSeen = fetchMock.mock.calls.some((call) => {
      const [url] = call;
      return typeof url === "string" && url.includes("/google/accounts/acc_1/locations/connect");
    });
    expect(connectedLocationCallSeen).toBe(true);
  });

  it("shows missing business fields, then persists brand voice and continues", async () => {
    const { mock: fetchMock, saveCalls } = makeFetchMock({
      claim: {
        ...defaultClaim(),
        status: "business_setup",
        onboarding_draft: {
          orgInfo: {
            name: "Acme HVAC",
            phone: "",
            addressOrServiceArea: "",
            contactName: "",
            contactEmail: "",
            primaryLocationCity: "",
            primaryLocationState: "",
            primaryCategory: "",
          },
          importedBusinessFields: ["name"],
        },
      },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<OnboardingPage />);

    await screen.findByText(/Confirm business info \+ brand voice/i);
    await screen.findByText(/^Missing required fields:/i);

    fireEvent.change(screen.getByPlaceholderText("HVAC contractor"), {
      target: { value: "HVAC contractor" },
    });
    fireEvent.change(screen.getByPlaceholderText("123 Main St, Austin, TX or Austin metro"), {
      target: { value: "Austin metro" },
    });
    fireEvent.change(screen.getByPlaceholderText("(555) 123-4567"), {
      target: { value: "(555) 123-4567" },
    });
    fireEvent.change(screen.getByPlaceholderText("Alex Reyes"), {
      target: { value: "Alex Reyes" },
    });
    fireEvent.change(screen.getByPlaceholderText("owner@example.com"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Austin"), {
      target: { value: "Austin" },
    });
    fireEvent.change(screen.getByPlaceholderText("TX"), {
      target: { value: "TX" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Professional" },
    });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add service/i }));
    fireEvent.change(screen.getByPlaceholderText(/Service \d+/i), {
      target: { value: "Duct Cleaning" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Add a concise, professional description for this service\./i), {
      target: { value: "Air duct cleaning for improved airflow and comfort." },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Continue$/i }));
    await screen.findByText(/Stripe payment \(final step\)/i);

    const stepTwoSave = saveCalls.find((call) => call.status === "stripe_pending");
    expect(stepTwoSave).toBeDefined();
    const stepTwoDraft = stepTwoSave?.onboarding_draft as Record<string, unknown>;
    expect((stepTwoDraft?.brandVoice as Record<string, unknown>)?.tone).toBe("Professional");
  });

  it("supports AI generation plus manual service editing/add/remove", async () => {
    const { mock: fetchMock, saveCalls } = makeFetchMock({
      claim: {
        ...defaultClaim(),
        status: "business_setup",
        onboarding_draft: {
          orgInfo: {
            name: "Acme HVAC",
            phone: "(555) 123-4567",
            addressOrServiceArea: "Austin metro",
            contactName: "Alex Reyes",
            contactEmail: "test@example.com",
            primaryCategory: "HVAC contractor",
            primaryLocationCity: "Austin",
            primaryLocationState: "TX",
          },
          brandVoice: {
            tone: "Professional",
          },
          services: [
            {
              name: "Duct Cleaning",
              description: "",
              source: "imported",
            },
          ],
        },
      },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<OnboardingPage />);

    await screen.findByText(/Confirm services \+ descriptions/i);
    await screen.findByText(/Description missing\./i);

    fireEvent.click(screen.getByRole("button", { name: /AI generate/i }));
    await waitFor(() => {
      expect(
        screen.getByDisplayValue(/Professional duct cleaning that improves airflow/i),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /\+ Add service/i }));
    const serviceInputs = screen.getAllByPlaceholderText(/Service \d+/i);
    const secondServiceInput = serviceInputs[serviceInputs.length - 1];
    fireEvent.change(secondServiceInput, { target: { value: "Furnace Repair" } });

    const descriptionBoxes = screen.getAllByPlaceholderText(
      /Add a concise, professional description for this service\./i,
    );
    fireEvent.change(descriptionBoxes[descriptionBoxes.length - 1], {
      target: { value: "Same-day furnace diagnostics and repair with clear estimates." },
    });

    const removeButtons = screen.getAllByRole("button", { name: /Remove/i });
    fireEvent.click(removeButtons[removeButtons.length - 1]);
    expect(screen.getAllByPlaceholderText(/Service \d+/i)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /^Continue$/i }));
    await screen.findByText(/Stripe payment \(final step\)/i);

    const stepTwoSave = saveCalls.find((call) => call.status === "stripe_pending");
    expect(stepTwoSave).toBeDefined();
  });

  it("keeps Stripe as final step and waits for webhook confirmation after checkout starts", async () => {
    const { mock: fetchMock, saveCalls } = makeFetchMock({
      claim: {
        ...defaultClaim(),
        status: "google_pending",
        onboarding_draft: {
          orgInfo: {
            name: "Acme HVAC",
            firstName: "Alex",
            lastName: "Reyes",
            phone: "(555) 123-4567",
            addressOrServiceArea: "Austin metro",
            contactName: "Alex Reyes",
            contactEmail: "test@example.com",
            primaryCategory: "HVAC contractor",
            primaryLocationCity: "Austin",
            primaryLocationState: "TX",
          },
          services: [
            {
              name: "Duct Cleaning",
              description: "Air duct cleaning for improved airflow and comfort.",
              source: "manual",
            },
          ],
        },
      },
      billing: {
        checkout_url: "https://checkout.stripe.test/session",
        session_id: "cs_test_123",
      },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<OnboardingPage />);

    await screen.findByText(/Stripe payment \(final step\)/i);
    await screen.findByText(/Waiting for webhook confirmation/i);
    expect(screen.getByRole("button", { name: /Check payment status/i })).toBeInTheDocument();

    expect(replace).not.toHaveBeenCalledWith("/dashboard");
    expect(saveCalls.find((call) => call.status === "completed")).toBeUndefined();
  });

  it("routes to dashboard when payment success returns with completed onboarding", async () => {
    getSearchParam.mockImplementation((key: string) => (key === "payment" ? "success" : null));
    const { mock: fetchMock } = makeFetchMock({
      claim: {
        ...defaultClaim(),
        status: "completed",
      },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/dashboard");
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("resumes onboarding at the correct next step", async () => {
    const scenarios: Array<{ status: string; heading: RegExp }> = [
      { status: "business_setup", heading: /Confirm business info \+ brand voice/i },
      { status: "stripe_pending", heading: /Stripe payment \(final step\)/i },
      { status: "stripe_started", heading: /Stripe payment \(final step\)/i },
    ];

    for (const scenario of scenarios) {
      const { mock: fetchMock } = makeFetchMock({
        claim: {
          ...defaultClaim(),
          status: scenario.status,
          onboarding_draft: {
            orgInfo: {
              name: "Acme HVAC",
              phone: "(555) 123-4567",
              addressOrServiceArea: "Austin metro",
              contactName: "Alex Reyes",
              contactEmail: "test@example.com",
              primaryCategory: "HVAC contractor",
              primaryLocationCity: "Austin",
              primaryLocationState: "TX",
            },
            services: [
              {
                name: "Duct Cleaning",
                description: "Air duct cleaning for improved airflow and comfort.",
                source: "manual",
              },
            ],
          },
        },
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const view = render(<OnboardingPage />);
      await screen.findByText(scenario.heading);
      view.unmount();
    }
  });

  it("shows account-switch guidance when invite and session emails differ", async () => {
    getSearchParam.mockImplementation((key: string) => (key === "invite_email" ? "invite@example.com" : null));
    const mismatchFetch = vi.fn((url: string) => {
      if (url.includes("/api/onboarding/claim")) {
        return Promise.resolve({
          ok: false,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                code: "invite_email_mismatch",
                error: "Invite email mismatch. Signed in as session@example.com, invite is for invite@example.com.",
                signed_in_email: "session@example.com",
                invite_email: "invite@example.com",
              }),
            ),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });
    global.fetch = mismatchFetch as unknown as typeof fetch;

    render(<OnboardingPage />);

    await screen.findByText(/This invite belongs to a different email/i);
    expect(screen.getByText(/session@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/invite@example.com/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign out and switch account/i })).toBeInTheDocument();
  });
});
