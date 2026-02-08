import Link from "next/link";

export default function PaymentCancelPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto w-full max-w-lg space-y-6 rounded-3xl bg-white p-8 text-center shadow-sm">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Checkout canceled</p>
        <h1 className="text-3xl font-semibold text-slate-900">No worries.</h1>
        <p className="text-sm text-slate-600">Your payment wasn’t completed. You can try again anytime.</p>
        <div className="flex flex-col gap-2">
          <Link href="/checkout" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">
            Return to checkout
          </Link>
          <Link href="/" className="text-sm font-semibold text-primary">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
