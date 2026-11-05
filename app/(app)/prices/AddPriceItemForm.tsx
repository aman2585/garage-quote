"use client";

import { useActionState, useRef } from "react";
import { addPriceItemAction } from "@/app/actions";

export function AddPriceItemForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: unknown, form: FormData) => {
    const res = await addPriceItemAction(undefined, form);
    if (!res?.error) ref.current?.reset();
    return res;
  }, undefined);
  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-2">
      <div className="min-w-48 flex-1">
        <label className="label" htmlFor="pi-name">Item</label>
        <input className="input" id="pi-name" name="name" required placeholder="e.g. Front brake pads (pair)" />
      </div>
      <div>
        <label className="label" htmlFor="pi-kind">Type</label>
        <select className="input w-32" id="pi-kind" name="kind" defaultValue="service">
          <option value="part">Part</option>
          <option value="labour">Labour</option>
          <option value="service">Service</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="pi-price">Price (₹)</label>
        <input className="input w-32" id="pi-price" name="price_rupees" inputMode="decimal" required />
      </div>
      <button className="btn-primary" disabled={pending}>{pending ? "Adding…" : "Add"}</button>
      {state?.error && <p className="w-full text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
