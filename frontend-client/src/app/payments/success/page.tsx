import Link from "next/link";

type PaymentSuccessProps = {
  searchParams?: {
    session_id?: string;
  };
};

export default function PaymentSuccessPage({ searchParams }: PaymentSuccessProps) {
  const sessionId = searchParams?.session_id;
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto w-full max-w-lg space-y-6 rounded-3xl bg-white p-8 text-center shadow-sm">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Payment complete</p>
        <h1 className="text-3xl font-semibold text-slate-900">Thanks for subscribing.</h1>
        <p className="text-sm text-slate-600">
          Your payment was successful. You can create your account and start onboarding right away.
        </p>
        {sessionId && (
          <p className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Session ID: <span className="font-semibold text-slate-700">{sessionId}</span>
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Link href="/sign-up" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">
            Create account
          </Link>
          <Link href="/" className="text-sm font-semibold text-primary">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
