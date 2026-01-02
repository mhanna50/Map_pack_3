"use client";

import { useMemo, useState } from "react";

const steps = [
  "Create org",
  "Connect Google",
  "Choose locations",
  "Configure automations",
  "Brand voice",
  "Finish",
];

const industries = ["Home Services", "Legal", "Healthcare", "Hospitality", "Other"];
const locationOptions = [
  { id: "loc-1", name: "Downtown HQ", address: "123 Main St" },
  { id: "loc-2", name: "Uptown Service", address: "88 Pine Ave" },
  { id: "loc-3", name: "Westside Warehouse", address: "42 Industrial Rd" },
];
const toneOptions = ["Friendly", "Professional", "Bold", "Concise"];

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [orgInfo, setOrgInfo] = useState({
    name: "",
    industry: industries[0],
    primaryLocation: "",
  });
  const [locationState, setLocationState] = useState(
    () =>
      locationOptions.reduce<Record<string, { selected: boolean; automation: boolean }>>((acc, loc, index) => {
        acc[loc.id] = { selected: index === 0, automation: true };
        return acc;
      }, {}),
  );
  const [automationConfig, setAutomationConfig] = useState({
    postingFrequency: "3 posts / week",
    reviewAutoThreshold: 4,
    reviewApprovalThreshold: 3,
    qnaCadence: "1 Q&A / week",
  });
  const [brandVoice, setBrandVoice] = useState({
    tone: toneOptions[0],
    services: "HVAC install, furnace tune-ups",
    cities: "Downtown, Uptown",
    websiteText: "",
  });

  const completed = currentStep === steps.length - 1;
  const nextDisabled =
    (currentStep === 0 && !orgInfo.name.trim()) ||
    (currentStep === 1 && !googleConnected) ||
    (currentStep === 2 && !Object.values(locationState).some((item) => item.selected));

  const progress = useMemo(() => ((currentStep + 1) / steps.length) * 100, [currentStep]);
  const scheduledDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 2);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, []);

  const handleLocationSelection = (id: string, field: "selected" | "automation") => {
    setLocationState((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: !prev[id][field] },
    }));
  };

  const goNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((step) => step + 1);
    }
  };

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep((step) => step - 1);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Onboarding</p>
          <h1 className="text-3xl font-semibold">Launch your automations</h1>
          <p className="text-sm text-slate-600">Finish the wizard so the dashboard is fully configured before day one.</p>
        </header>

        <div>
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>
              Step {currentStep + 1} / {steps.length}
            </span>
            <span>{steps[currentStep]}</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <section className="space-y-6 rounded-3xl bg-white p-6 shadow-sm">
          {currentStep === 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Create organization</h2>
              <div className="space-y-3 text-sm">
                <label className="block">
                  <span className="text-slate-600">Company name</span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="Acme HVAC"
                    value={orgInfo.name}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-slate-600">Industry</span>
                  <select
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    value={orgInfo.industry}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, industry: event.target.value }))}
                  >
                    {industries.map((industry) => (
                      <option key={industry}>{industry}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-slate-600">Primary location (optional)</span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    placeholder="City, State"
                    value={orgInfo.primaryLocation}
                    onChange={(event) => setOrgInfo((prev) => ({ ...prev, primaryLocation: event.target.value }))}
                  />
                </label>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Connect Google Business Profile</h2>
                <p className="text-sm text-slate-600">Authorize Map Pack 3 so we can read listings and post on your behalf.</p>
              </div>
              <button
                className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white"
                onClick={() => setGoogleConnected(true)}
              >
                {googleConnected ? "Google Connected ✓" : "Connect Google"}
              </button>
              {googleConnected && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-600">
                  Success! We can now fetch your GBP locations.
                </div>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Choose locations</h2>
              <p className="text-sm text-slate-600">Pick which GBP locations to automate. You can add more later.</p>
              <div className="space-y-3">
                {locationOptions.map((location) => {
                  const selection = locationState[location.id];
                  return (
                    <div key={location.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 p-4">
                      <div>
                        <p className="font-semibold">{location.name}</p>
                        <p className="text-sm text-slate-500">{location.address}</p>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selection.selected}
                            onChange={() => handleLocationSelection(location.id, "selected")}
                          />
                          Enable location
                        </label>
                        <label className={`flex items-center gap-2 ${!selection.selected ? "text-slate-400" : ""}`}>
                          <input
                            type="checkbox"
                            checked={selection.automation}
                            disabled={!selection.selected}
                            onChange={() => handleLocationSelection(location.id, "automation")}
                          />
                          Enable automation
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Configure automations</h2>
              <p className="text-sm text-slate-600">Tell us how often to publish and when to require approvals.</p>
              <div className="space-y-3 text-sm">
                <label className="block">
                  <span className="text-slate-600">Posting frequency</span>
                  <select
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    value={automationConfig.postingFrequency}
                    onChange={(event) => setAutomationConfig((prev) => ({ ...prev, postingFrequency: event.target.value }))}
                  >
                    {["2 posts / week", "3 posts / week", "4 posts / week"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="text-slate-600">Auto-reply reviews rated</span>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                      value={automationConfig.reviewAutoThreshold}
                      onChange={(event) =>
                        setAutomationConfig((prev) => ({ ...prev, reviewAutoThreshold: Number(event.target.value) }))
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="text-slate-600">Require approval when rating ≤</span>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                      value={automationConfig.reviewApprovalThreshold}
                      onChange={(event) =>
                        setAutomationConfig((prev) => ({ ...prev, reviewApprovalThreshold: Number(event.target.value) }))
                      }
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-slate-600">Q&A cadence</span>
                  <select
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    value={automationConfig.qnaCadence}
                    onChange={(event) => setAutomationConfig((prev) => ({ ...prev, qnaCadence: event.target.value }))}
                  >
                    {["1 Q&A / week", "2 Q&A / week"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Brand voice</h2>
              <p className="text-sm text-slate-600">We use this to seed AI-generated captions, replies, and Q&A.</p>
              <div className="space-y-3 text-sm">
                <label className="block">
                  <span className="text-slate-600">Tone</span>
                  <select
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    value={brandVoice.tone}
                    onChange={(event) => setBrandVoice((prev) => ({ ...prev, tone: event.target.value }))}
                  >
                    {toneOptions.map((tone) => (
                      <option key={tone}>{tone}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-slate-600">Services</span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    value={brandVoice.services}
                    onChange={(event) => setBrandVoice((prev) => ({ ...prev, services: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-slate-600">Cities / Areas</span>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    value={brandVoice.cities}
                    onChange={(event) => setBrandVoice((prev) => ({ ...prev, cities: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-slate-600">Optional: Paste website copy</span>
                  <textarea
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    rows={3}
                    placeholder="Paste your about copy or service descriptions"
                    value={brandVoice.websiteText}
                    onChange={(event) => setBrandVoice((prev) => ({ ...prev, websiteText: event.target.value }))}
                  />
                </label>
                <div className="rounded-2xl bg-slate-50 p-4 text-sm">
                  <p className="text-xs font-semibold text-slate-500">Preview</p>
                  <p className="text-slate-700">
                    {brandVoice.tone} tone with services {brandVoice.services || "—"} in {brandVoice.cities || "—"}.
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-4 text-center">
              <h2 className="text-2xl font-semibold">All set!</h2>
              <p className="text-sm text-slate-600">Your next automated post is scheduled for {scheduledDate}.</p>
              <div className="rounded-3xl border border-slate-100 bg-slate-50 p-6">
                <p className="text-lg font-semibold">Invite teammates</p>
                <p className="text-sm text-slate-600">Bring owners or admins into the dashboard to share approvals.</p>
                <button className="mt-4 rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary">
                  Copy invite link
                </button>
              </div>
              <a href="/app" className="inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white">
                Go to dashboard
              </a>
            </div>
          )}
        </section>

        <div className="flex justify-between">
          <button
            className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
            onClick={goBack}
            disabled={currentStep === 0}
          >
            Back
          </button>
          {!completed && (
            <button
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={goNext}
              disabled={nextDisabled}
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
