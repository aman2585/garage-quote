import { requireGarage } from "@/lib/auth";
import { ProfileForm } from "./ProfileForm";

export default async function SettingsPage() {
  const g = await requireGarage();
  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Garage details</h1>
        <p className="mt-1 text-sm text-muted">These show at the top of every quote your customers open.</p>
      </div>
      <section className="card p-5">
        <ProfileForm name={g.name} city={g.city ?? ""} phone={g.phone ?? ""} />
      </section>
    </div>
  );
}
