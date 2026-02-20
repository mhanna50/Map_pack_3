import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OnboardingPage from "@/app/onboarding/page";

// Provide a dummy Stripe key for loadStripe
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_dummy";

// Mock Stripe React components to avoid hitting the real Stripe JS
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PaymentElement: () => <div>Payment form</div>,
  useStripe: () => ({ confirmPayment: vi.fn().mockResolvedValue({}) }),
  useElements: () => ({}),
}));

// Mock next/navigation hooks
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: () => null }),
}));

// Mock supabase session helpers
vi.mock("@/lib/supabase/session", () => ({
  getAccessToken: vi.fn().mockResolvedValue("fake-token"),
}));

// Mock supabase client for user email
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1", email: "test@example.com" } } }) } }),
}));

// Mock fetch for onboarding save and billing subscribe
global.fetch = vi.fn((url) => {
  if (typeof url === "string" && url.endsWith("/billing/subscribe")) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ client_secret: "secret", subscription_id: "sub_123" }) });
  }
  if (typeof url === "string" && url.includes("/api/onboarding/save")) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ saved: true }) });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
}) as unknown as typeof fetch;

describe("Onboarding flow", () => {
  it("requires account session on step 0 and proceeds after continue", async () => {
    render(<OnboardingPage />);

    const continueBtn = screen.getByRole("button", { name: /continue/i });
    await waitFor(() => expect(continueBtn).toBeEnabled());
    fireEvent.click(continueBtn);

    await screen.findAllByText(/Business setup/i);
  });

  it("shows Stripe step and renders payment form placeholder", async () => {
    render(<OnboardingPage />);

    const continueBtn = screen.getByRole("button", { name: /continue/i });
    await waitFor(() => expect(continueBtn).toBeEnabled());
    fireEvent.click(continueBtn); // to business setup

    const [breadcrumb, heading] = await screen.findAllByText(/Business setup/i);
    expect(breadcrumb).toBeInTheDocument();
    expect(heading).toBeInTheDocument();

    // Fill minimal company name to allow next
    fireEvent.change(screen.getByPlaceholderText(/Acme HVAC/i), { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await screen.findByText(/Sign up for Stripe/i);
    expect(screen.getByText(/Awaiting payment/i)).toBeInTheDocument();
  });
});
