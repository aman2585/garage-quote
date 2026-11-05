"use client";

import { useActionState } from "react";
import { updateGarageAction } from "@/app/actions";

export function ProfileForm({ name, city, phone }: { name: string; city: string; phone: string }) {
  const [state, action, pending] = useActionState(async (_: unknown, form: FormData) => {
    const res = await updateGarageAction(undefined, form);
    return res?.error ? res : { ok: true as const };
  }, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="g-name">Garage name</label>
        <input className="input" id="g-name" name="name" required defaultValue={name} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="g-city">City</label>
          <input className="input" id="g-city" name="city" defaultValue={city} />
        </div>
        <div>
          <label className="label" htmlFor="g-phone">Phone</label>
          <input className="input" id="g-phone" name="phone" inputMode="tel" defaultValue={phone} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {state && "error" in state && state.error && <span className="text-sm text-red-700">{state.error}</span>}
        {state && "ok" in state && <span className="text-sm text-emerald-700">Saved</span>}
      </div>
    </form>
  );
}
