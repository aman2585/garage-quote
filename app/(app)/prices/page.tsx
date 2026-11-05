import { requireGarage } from "@/lib/auth";
import { listPriceItems } from "@/lib/quotes";
import { loadSamplePricesAction, updatePriceItemAction } from "@/app/actions";
import { AddPriceItemForm } from "./AddPriceItemForm";

export default async function PricesPage() {
  const g = await requireGarage();
  const items = await listPriceItems(g.id, undefined, true);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Price list</h1>
        <p className="mt-1 text-sm text-muted">
          Claude uses these prices first when it drafts a quote. You can also paste your rate card into Claude and ask
          it to save the items here.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Add an item</h2>
        <AddPriceItemForm />
      </section>

      <section className="card divide-y divide-line">
        {items.length === 0 && (
          <div className="space-y-3 p-6 text-center text-sm text-muted">
            <p>No items yet. Add your own above, or start with a set of sample prices to try the app.</p>
            <form action={loadSamplePricesAction}>
              <button className="btn-ghost">Add 9 sample prices (edit them anytime)</button>
            </form>
          </div>
        )}
        {items.map((it) => (
          <form key={it.id} action={updatePriceItemAction} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <input type="hidden" name="id" value={it.id} />
            <input className="input min-w-48 flex-1" name="name" defaultValue={it.name} aria-label="Name" />
            <select className="input w-32" name="kind" defaultValue={it.kind} aria-label="Type">
              <option value="part">Part</option>
              <option value="labour">Labour</option>
              <option value="service">Service</option>
            </select>
            <input
              className="input w-32 tabular-nums"
              name="price_rupees"
              inputMode="decimal"
              defaultValue={String(it.unit_price_paise / 100)}
              aria-label="Price in rupees"
            />
            <label className="flex items-center gap-1 text-sm text-muted">
              <input type="checkbox" name="active" defaultChecked={it.active} /> Active
            </label>
            <button className="btn-ghost">Save</button>
          </form>
        ))}
      </section>
    </div>
  );
}
