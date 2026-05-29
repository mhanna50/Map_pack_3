import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/", "/sign-in", "/sign-up", "/reset-password", "/onboarding", "/checkout", "/payments"];
const DISABLE_AUTH = process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";
const LEGACY_APP_REDIRECTS: Record<string, string> = {
  "/app": "/dashboard",
  "/app/posts": "/dashboard/gbp",
  "/app/media": "/dashboard/content",
  "/app/reviews": "/dashboard/reviews",
  "/app/rankings": "/dashboard/keywords",
  "/app/settings": "/dashboard/settings",
  "/app/competitors": "/dashboard/keywords",
  "/app/qna": "/dashboard/gbp",
  "/app/approvals": "/dashboard",
  "/app/reports": "/dashboard",
  "/app/notifications": "/dashboard",
};

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const legacyTarget = LEGACY_APP_REDIRECTS[pathname];
  if (legacyTarget) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = legacyTarget;
    return NextResponse.redirect(redirectUrl);
  }
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });
  if (DISABLE_AUTH) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set(name, value, options) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|trpc|.*\\..*|_next).*)"],
};
