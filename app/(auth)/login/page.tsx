import Link from "next/link";
import { LoginForm } from "../AuthForms";

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <Link href="/" className="text-sm font-semibold text-brand">GarageQuote</Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold">Log in to your garage</h1>
      <div className="card p-6"><LoginForm /></div>
      <p className="mt-4 text-sm text-muted">
        New here? <Link href="/signup" className="text-brand underline">Create a garage account</Link>
      </p>
    </main>
  );
}
