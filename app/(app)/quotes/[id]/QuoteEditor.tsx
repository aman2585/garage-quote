"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveQuoteAction, setQuoteStatusAction } from "@/app/actions";
import { formatPaise, lineTotalPaise } from "@/lib/money";
import type { Kind, PriceItem, QuoteWithLines } from "@/lib/quotes";
import { CopyButton, StatusChip } from "../../ui";

type EditLine = {
  key: string;
  description: string;
  kind: Kind;
  qty: string;
  price_rupees: string;
  price_item_id: string | null;
};

let keySeq = 0;
const k = () => `l${++keySeq}`;

function toEdit(l: QuoteWithLines["lines"][number]): EditLine {
  return {
    key: k(),
    description: l.description,
    kind: l.kind,
    qty: String(l.qty),
    price_rupees: String(l.unit_price_paise / 100),
    price_item_id: l.price_item_id,
  };
}

function waLink(phone: string | null, text: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const to = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

export function QuoteEditor({
  quote,
  priceItems,
  publicUrl,
  garageName,
}: {
  quote: QuoteWithLines;
  priceItems: PriceItem[];
  publicUrl: string;
  garageName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [customer, setCustomer] = useState(quote.customer_name);
  const [phone, setPhone] = useState(quote.customer_phone ?? "");
  const [vehicle, setVehicle] = useState(quote.vehicle);
  const [notes, setNotes] = useState(quote.notes ?? "");
  const [lines, setLines] = useState<EditLine[]>(quote.lines.map(toEdit));
  const [dirty, setDirty] = useState(false);

  const update = (key: string, patch: Partial<EditLine>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setDirty(true);
  };

  const total = lines.reduce(
    (s, l) => s + lineTotalPaise(Number(l.qty) || 0, Math.round((Number(l.price_rupees) || 0) * 100)),
    0,
  );

  const addFromPriceList = (id: string) => {
    const it = priceItems.find((p) => p.id === id);
    if (!it) return;
    setLines((ls) => [
      ...ls,
      { key: k(), description: it.name, kind: it.kind, qty: "1", price_rupees: String(it.unit_price_paise / 100), price_item_id: it.id },
    ]);
    setDirty(true);
  };

  const save = () =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        const res = await saveQuoteAction(quote.id, {
          customer_name: customer,
          customer_phone: phone || null,
          vehicle,
          notes: notes || null,
          lines: lines.map((l) => ({
            description: l.description,
            kind: l.kind,
            qty: Number(l.qty),
            unit_price_paise: Math.round(Number(l.price_rupees) * 100),
            price_item_id: l.price_item_id,
          })),
        });
        setMsg(res.ok ? { ok: true, text: "Saved" } : { ok: false, text: res.error ?? "Could not save" });
        if (res.ok) {
          setDirty(false);
          router.refresh();
        }
        resolve(res.ok);
      }),
    );

  const markSent = () =>
    start(async () => {
      if (dirty && !(await save())) return;
      await setQuoteStatusAction(quote.id, "sent");
      router.refresh();
    });

  const shareText = `Hello ${customer}, here is your quote from ${garageName} for ${vehicle}: ${publicUrl}`;

  return (
    <div className="mt-3 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Quote Q-{quote.seq}</h1>
        <StatusChip status={quote.status} />
        {quote.created_by === "claude" && (
          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800">drafted by Claude</span>
        )}
        {quote.status === "accepted" && quote.accepted_at && (
          <span className="text-sm text-emerald-800">
            Accepted{quote.accepted_by_name ? ` by ${quote.accepted_by_name}` : ""} on{" "}
            {new Date(quote.accepted_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
          </span>
        )}
      </div>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label className="label">Customer name</label>
          <input className="input" value={customer} onChange={(e) => { setCustomer(e.target.value); setDirty(true); }} />
        </div>
        <div>
          <label className="label">Customer phone</label>
          <input className="input" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setDirty(true); }} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Vehicle</label>
          <input className="input" value={vehicle} onChange={(e) => { setVehicle(e.target.value); setDirty(true); }} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Notes for the customer</label>
          <textarea className="input min-h-20" value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} />
        </div>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="w-20 px-3 py-2 font-medium">Qty</th>
              <th className="w-32 px-3 py-2 font-medium">Price (₹)</th>
              <th className="w-28 px-3 py-2 text-right font-medium">Amount</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => (
              <tr key={l.key} className={l.price_item_id ? "" : "bg-amber-50/60"}>
                <td className="px-3 py-2">
                  <input className="input" value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} />
                  {!l.price_item_id && (
                    <span className="mt-1 block text-xs text-amber-800">Not in your price list: check the price</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <select className="input" value={l.kind} onChange={(e) => update(l.key, { kind: e.target.value as Kind })}>
                    <option value="part">Part</option>
                    <option value="labour">Labour</option>
                    <option value="service">Service</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input className="input tabular-nums" inputMode="decimal" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <input className="input tabular-nums" inputMode="decimal" value={l.price_rupees} onChange={(e) => update(l.key, { price_rupees: e.target.value })} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatPaise(lineTotalPaise(Number(l.qty) || 0, Math.round((Number(l.price_rupees) || 0) * 100)))}
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    aria-label="Remove line"
                    className="rounded p-1 text-muted hover:bg-stone-100 hover:text-red-700"
                    onClick={() => { setLines((ls) => ls.filter((x) => x.key !== l.key)); setDirty(true); }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line">
              <td colSpan={4} className="px-3 py-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setLines((ls) => [...ls, { key: k(), description: "", kind: "service", qty: "1", price_rupees: "0", price_item_id: null }]);
                      setDirty(true);
                    }}
                  >
                    + Add line
                  </button>
                  {priceItems.length > 0 && (
                    <select className="input w-auto" value="" onChange={(e) => addFromPriceList(e.target.value)}>
                      <option value="">+ Add from price list…</option>
                      {priceItems.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({formatPaise(p.unit_price_paise)})</option>
                      ))}
                    </select>
                  )}
                </div>
              </td>
              <td className="px-3 py-3 text-right text-base font-bold tabular-nums">{formatPaise(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending || !dirty} onClick={() => void save()}>
          {pending ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
        {quote.status === "draft" && (
          <button className="btn-ghost" disabled={pending} onClick={markSent}>Mark as sent</button>
        )}
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</span>}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Customer link</h2>
        <p className="text-sm text-muted">Your customer opens this to see the quote and accept it. No login needed.</p>
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-0 flex-1 font-mono text-xs" readOnly value={publicUrl} aria-label="Customer link" />
          <CopyButton text={publicUrl} />
          <a className="btn-ghost" href={publicUrl} target="_blank" rel="noreferrer">Open</a>
          <a className="btn-primary" href={waLink(phone || null, shareText)} target="_blank" rel="noreferrer">Share on WhatsApp</a>
        </div>
      </section>
    </div>
  );
}
