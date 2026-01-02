"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";

export default function ResetPasswordPage() {
  const { pushToast } = useToast();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    pushToast({
      title: "Reset link sent",
      description: "Check your inbox for the confirmation code.",
      tone: "success",
    });
    setEmail("");
    setCode("");
    setPassword("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6 rounded-3xl bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Security</p>
          <h1 className="text-2xl font-semibold text-slate-900">Reset password</h1>
          <p className="text-sm text-slate-600">Enter your email and the code we send to finish resetting.</p>
        </div>
        <label className="block text-sm">
          <span className="text-slate-600">Work email</span>
          <input
            className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@agency.com"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Verification code</span>
          <input
            className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="123456"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">New password</span>
          <input
            className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </label>
        <button type="submit" className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">
          Send reset link
        </button>
        <p className="text-center text-sm text-slate-500">
          Remembered password?{" "}
          <Link href="/sign-in" className="font-semibold text-primary">
            Back to login
          </Link>
        </p>
      </form>
    </div>
  );
}
