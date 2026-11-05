import Link from "next/link";
import { notFound } from "next/navigation";
import { requireGarage } from "@/lib/auth";
import { getQuote, listPriceItems } from "@/lib/quotes";
import { appOrigin } from "@/lib/origin";
import { QuoteEditor } from "./QuoteEditor";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireGarage();
  const [quote, items, origin] = await Promise.all([getQuote(g.id, id), listPriceItems(g.id), appOrigin()]);
  if (!quote) notFound();
  return (
    <div>
      <Link href="/dashboard" className="text-sm text-muted hover:text-ink">← All quotes</Link>
      <QuoteEditor
        key={quote.updated_at.toString()}
        quote={JSON.parse(JSON.stringify(quote))}
        priceItems={items}
        publicUrl={`${origin}/q/${quote.public_id}`}
        garageName={g.name}
      />
    </div>
  );
}
