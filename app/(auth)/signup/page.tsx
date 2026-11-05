import Link from "next/link";
import { SignupForm } from "../AuthForms";

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Link href="/" className="text-sm font-semibold text-brand">GarageQuote</Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold">Create your garage account</h1>
      <div className="card p-6"><SignupForm /></div>
      <p className="mt-4 text-sm text-muted">
        Already have one? <Link href="/login" className="text-brand underline">Log in</Link>
      </p>
    </main>
  );
}
