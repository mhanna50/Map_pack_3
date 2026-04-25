import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockSignOut = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
      signOut: mockSignOut,
    },
  }),
}));

import { getAccessToken } from "@/lib/supabase/session";

describe("getAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue({ error: null });
  });

  it("returns access token when session exists", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "token_123" } },
      error: null,
    });

    await expect(getAccessToken()).resolves.toBe("token_123");
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("clears local session and returns null for invalid refresh token errors", async () => {
    mockGetSession.mockRejectedValue(new Error("Invalid Refresh Token: Refresh Token Not Found"));

    await expect(getAccessToken()).resolves.toBeNull();
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("rethrows non-refresh token errors", async () => {
    mockGetSession.mockRejectedValue(new Error("Network unavailable"));

    await expect(getAccessToken()).rejects.toThrow("Network unavailable");
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
