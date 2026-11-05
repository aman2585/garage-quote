import Link from "next/link";
import { redirect } from "next/navigation";
import { currentGarage } from "@/lib/auth";

export default async function Home() {
  if (await currentGarage()) redirect("/dashboard");
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">GarageQuote</p>
      <h1 className="mt-3 text-4xl font-bold leading-tight">
        Tell your Claude about the car. Send the customer a quote link.
      </h1>
      <p className="mt-4 text-lg text-muted">
        Your own Claude drafts the estimate from your price list. GarageQuote keeps it, lets you edit it, and gives
        your customer a live link to view and accept. There is no AI inside this app.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/signup" className="btn-primary">Create a garage account</Link>
        <Link href="/login" className="btn-ghost">Log in</Link>
      </div>
    </main>
  );
}
