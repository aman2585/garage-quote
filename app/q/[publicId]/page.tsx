import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicQuote } from "@/lib/quotes";
import { formatPaise, lineTotalPaise } from "@/lib/money";
import { acceptQuoteAction } from "@/app/actions";

export const metadata: Metadata = { title: "Your quote", robots: { index: false, follow: false } };

export default async function PublicQuote({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const q = await getPublicQuote(publicId);
  if (!q) notFound();
  const accept = acceptQuoteAction.bind(null, publicId);

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Quote Q-{q.seq}</p>
        <h1 className="mt-1 text-2xl font-bold">{q.garage_name}</h1>
        <p className="text-sm text-muted">
          {[q.garage_city, q.garage_phone].filter(Boolean).join(" · ")}
        </p>
      </header>

      <section className="card p-5">
        <p className="text-sm text-muted">For</p>
        <p className="font-medium">{q.customer_name}</p>
        <p className="text-sm">{q.vehicle}</p>
        {q.notes && <p className="mt-3 whitespace-pre-line text-sm">{q.notes}</p>}
      </section>

      <section className="card mt-4 divide-y divide-line">
        {q.lines.map((l) => (
          <div key={l.id} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
            <div>
              <p>{l.description}</p>
              <p className="text-xs capitalize text-muted">
                {l.kind}
                {l.qty !== 1 ? ` · ${l.qty} × ${formatPaise(l.unit_price_paise)}` : ""}
              </p>
            </div>
            <p className="tabular-nums">{formatPaise(lineTotalPaise(l.qty, l.unit_price_paise))}</p>
          </div>
        ))}
        <div className="flex justify-between px-5 py-4 text-base font-bold">
          <span>Total</span>
          <span className="tabular-nums">{formatPaise(q.total_paise)}</span>
        </div>
      </section>

      <section className="mt-5">
        {q.status === "accepted" ? (
          <div className="rounded-xl bg-emerald-50 p-5 text-emerald-900">
            <p className="font-semibold">Quote accepted</p>
            <p className="text-sm">
              {q.garage_name} has been notified in their app
              {q.accepted_at ? ` (${new Date(q.accepted_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })})` : ""}.
            </p>
          </div>
        ) : (
          <form action={accept} className="card space-y-3 p-5">
            <label className="label" htmlFor="name">Your name (optional)</label>
            <input className="input" id="name" name="name" maxLength={80} defaultValue={q.customer_name} />
            <button className="btn-primary w-full py-3 text-base">Accept this quote</button>
            <p className="text-xs text-muted">Accepting tells {q.garage_name} to go ahead with this work.</p>
          </form>
        )}
      </section>

      <p className="mt-8 text-center text-xs text-muted">Sent with GarageQuote</p>
    </main>
  );
}
