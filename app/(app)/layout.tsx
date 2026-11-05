import Link from "next/link";
import { requireGarage } from "@/lib/auth";
import { logoutAction } from "@/app/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const g = await requireGarage();
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="font-bold text-brand">GarageQuote</Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/dashboard" className="hover:text-brand">Quotes</Link>
            <Link href="/prices" className="hover:text-brand">Price list</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-muted">
            <span className="hidden sm:inline">{g.name}</span>
            <form action={logoutAction}><button className="hover:text-ink">Log out</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
