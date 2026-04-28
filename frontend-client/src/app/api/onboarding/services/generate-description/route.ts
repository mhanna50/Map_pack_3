import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type ServiceDescriptionRequest = {
  service_name?: unknown;
  business_name?: unknown;
  primary_category?: unknown;
  city?: unknown;
  state?: unknown;
  tone?: unknown;
};

const asTrimmedString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const hasAuthenticatedUser = async (): Promise<boolean> => {
  if (!supabaseUrl || !supabaseAnonKey) return false;
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value;
      },
      set() {},
      remove() {},
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user?.id);
};

const normalizeTone = (value: string): string => {
  const normalized = value.toLowerCase();
  if (["friendly", "professional", "bold", "concise"].includes(normalized)) {
    return normalized;
  }
  return "professional";
};

const buildFallbackDescription = (
  serviceName: string,
  businessName: string,
  primaryCategory: string,
  city: string,
  state: string,
) => {
  const location = [city, state].filter(Boolean).join(", ");
  const businessContext = businessName || "our team";
  const categoryContext = primaryCategory || "local business";
  const locationText = location ? ` in ${location}` : "";
  return `${businessContext} provides ${serviceName}${locationText} with reliable, timely support. This ${categoryContext} service is delivered with clear communication, professional standards, and results-focused execution.`;
};

const generateWithOpenAi = async (
  apiKey: string,
  serviceName: string,
  businessName: string,
  primaryCategory: string,
  city: string,
  state: string,
  tone: string,
): Promise<string | null> => {
  const location = [city, state].filter(Boolean).join(", ");
  const systemPrompt =
    "You write concise, professional local-business service descriptions for onboarding. Return one paragraph, plain text, 30-60 words.";
  const userPrompt = [
    `Service: ${serviceName}`,
    `Business: ${businessName || "N/A"}`,
    `Primary category: ${primaryCategory || "N/A"}`,
    `Location: ${location || "N/A"}`,
    `Tone: ${tone}`,
    "Focus on clarity, trust, and local SEO usefulness without keyword stuffing.",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status})`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
    }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content || !content.trim()) {
    return null;
  }
  return content.trim();
};

export async function POST(request: NextRequest) {
  if (!(await hasAuthenticatedUser())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: ServiceDescriptionRequest;
  try {
    body = (await request.json()) as ServiceDescriptionRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const serviceName = asTrimmedString(body.service_name);
  if (serviceName.length < 2) {
    return NextResponse.json({ error: "service_name must be at least 2 characters" }, { status: 400 });
  }

  const businessName = asTrimmedString(body.business_name);
  const primaryCategory = asTrimmedString(body.primary_category);
  const city = asTrimmedString(body.city);
  const state = asTrimmedString(body.state);
  const tone = normalizeTone(asTrimmedString(body.tone));

  const fallbackDescription = buildFallbackDescription(
    serviceName,
    businessName,
    primaryCategory,
    city,
    state,
  );

  const apiKey = asTrimmedString(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return NextResponse.json({
      description: fallbackDescription,
      source: "template",
    });
  }

  try {
    const generated = await generateWithOpenAi(
      apiKey,
      serviceName,
      businessName,
      primaryCategory,
      city,
      state,
      tone,
    );
    if (!generated) {
      return NextResponse.json({
        description: fallbackDescription,
        source: "template_fallback",
      });
    }
    return NextResponse.json({
      description: generated,
      source: "openai",
    });
  } catch (error) {
    console.warn("service_description_generation_failed", {
      serviceName,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({
      description: fallbackDescription,
      source: "template_fallback",
    });
  }
}
