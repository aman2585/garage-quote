import Link from "next/link";
import { requireGarage } from "@/lib/auth";
import { listQuotes } from "@/lib/quotes";
import { formatPaise } from "@/lib/money";
import { appOrigin, mcpUrl } from "@/lib/origin";
import { newQuoteAction, regenerateSecretAction } from "@/app/actions";
import { AutoRefresh, CopyButton, StatusChip } from "../ui";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata",
});

export default async function Dashboard() {
  const g = await requireGarage();
  const [quotes, origin] = await Promise.all([listQuotes(g.id), appOrigin()]);
  const url = mcpUrl(origin, g.mcp_secret);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={5} />

      <section className="card p-5">
        <h2 className="font-semibold">Connect your Claude</h2>
        <p className="mt-1 text-sm text-muted">
          This link is private to {g.name}. Anyone with it can create quotes for your garage, so keep it to yourself.
        </p>
        <div className="mt-3 flex gap-2">
          <input className="input font-mono text-xs" readOnly value={url} aria-label="Your MCP link" />
          <CopyButton text={url} />
        </div>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>In Claude, open <b>Customize → Connectors → Add custom connector</b>.</li>
          <li>Name it <b>GarageQuote</b> and paste the link above as the MCP server URL. Leave sign-in empty.</li>
          <li>Click <b>Add</b>, then enable GarageQuote in a new chat (the <b>+</b> menu → Connectors).</li>
          <li>Try: &ldquo;Customer Ravi, 2017 Swift petrol, front brake noise, also wants AC service. Make a quote.&rdquo;</li>
        </ol>
        <form action={regenerateSecretAction} className="mt-3">
          <button className="text-xs text-muted underline hover:text-ink">
            Make a new link (the old one stops working)
          </button>
        </form>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Quotes</h2>
          <form action={newQuoteAction}><button className="btn-ghost">New quote by hand</button></form>
        </div>
        {quotes.length === 0 ? (
          <div className="card p-8 text-center text-sm text-muted">
            No quotes yet. Ask your Claude to make one, and it appears here within a few seconds.
          </div>
        ) : (
          <ul className="card divide-y divide-line">
            {quotes.map((q) => (
              <li key={q.id}>
                <Link href={`/quotes/${q.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-stone-50">
                  <span className="w-16 font-mono text-xs text-muted">Q-{q.seq}</span>
                  <span className="min-w-40 flex-1">
                    <span className="font-medium">{q.customer_name}</span>
                    <span className="block text-sm text-muted">{q.vehicle}</span>
                  </span>
                  {q.created_by === "claude" && (
                    <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800">by Claude</span>
                  )}
                  <StatusChip status={q.status} />
                  <span className="w-28 text-right font-medium tabular-nums">{formatPaise(q.total_paise)}</span>
                  <span className="w-32 text-right text-xs text-muted">{dateFmt.format(new Date(q.created_at))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
