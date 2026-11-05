"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { endSession, hashPassword, newSecret, requireGarage, startSession, verifyPassword } from "@/lib/auth";
import {
  acceptPublicQuote,
  createQuote,
  QuoteLockedError,
  updatePriceItem,
  updateQuote,
  upsertPriceItems,
} from "@/lib/quotes";
import { editorPayloadSchema, garageProfileSchema, priceItemFormSchema, signupSchema, statusSchema } from "@/lib/schemas";
import { rupeesToPaise } from "@/lib/money";
import { SAMPLE_PRICES } from "@/lib/sample-prices";

export type FormState = { error?: string } | undefined;

export async function signupAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Check the fields: name, a valid email, and a password of 8+ characters." };
  const { name, city, phone, email, password } = parsed.data;
  const sql = await db();
  const exists = await sql`select 1 from garages where email = ${email}`;
  if (exists.length) return { error: "An account with this email already exists. Log in instead." };
  const [g] = await sql<{ id: string }[]>`
    insert into garages (name, city, phone, email, password_hash, mcp_secret)
    values (${name}, ${city || null}, ${phone || null}, ${email}, ${hashPassword(password)}, ${newSecret()})
    returning id`;
  await startSession(g.id);
  redirect("/dashboard");
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const sql = await db();
  const [g] = await sql<{ id: string; password_hash: string }[]>`
    select id, password_hash from garages where email = ${email}`;
  if (!g || !verifyPassword(password, g.password_hash)) return { error: "Wrong email or password." };
  await startSession(g.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function regenerateSecretAction() {
  const g = await requireGarage();
  const sql = await db();
  await sql`update garages set mcp_secret = ${newSecret()} where id = ${g.id}`;
  revalidatePath("/dashboard");
}

export async function updateGarageAction(_: FormState, form: FormData): Promise<FormState> {
  const g = await requireGarage();
  const parsed = garageProfileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter a garage name of at least 2 characters." };
  const { name, city, phone } = parsed.data;
  const sql = await db();
  await sql`update garages set name = ${name}, city = ${city || null}, phone = ${phone || null} where id = ${g.id}`;
  revalidatePath("/", "layout");
  return {};
}

// ---------- price list ----------

export async function addPriceItemAction(_: FormState, form: FormData): Promise<FormState> {
  const g = await requireGarage();
  const parsed = priceItemFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter a name, a type and a price in rupees." };
  await upsertPriceItems(g.id, [
    { name: parsed.data.name, kind: parsed.data.kind, unit_price_paise: rupeesToPaise(parsed.data.price_rupees) },
  ]);
  revalidatePath("/prices");
  return {};
}

export async function loadSamplePricesAction() {
  const g = await requireGarage();
  await upsertPriceItems(g.id, SAMPLE_PRICES);
  revalidatePath("/prices");
}

export async function updatePriceItemAction(form: FormData) {
  const g = await requireGarage();
  const parsed = priceItemFormSchema.safeParse(Object.fromEntries(form));
  const id = String(form.get("id") ?? "");
  if (!parsed.success || !id) return;
  await updatePriceItem(g.id, id, {
    name: parsed.data.name,
    kind: parsed.data.kind,
    unit_price_paise: rupeesToPaise(parsed.data.price_rupees),
    active: form.get("active") === "on",
  });
  revalidatePath("/prices");
}

// ---------- quotes ----------

export async function newQuoteAction() {
  const g = await requireGarage();
  const q = await createQuote(g.id, { customer_name: "New customer", vehicle: "Vehicle" }, [], "garage");
  redirect(`/quotes/${q.id}`);
}

export async function saveQuoteAction(quoteId: string, payload: unknown): Promise<{ ok: boolean; error?: string }> {
  const g = await requireGarage();
  const parsed = editorPayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Some fields are invalid: every line needs a description, qty above 0 and a price." };
  const { lines, ...fields } = parsed.data;
  let q;
  try {
    q = await updateQuote(g.id, quoteId, fields, lines);
  } catch (e) {
    if (e instanceof QuoteLockedError) return { ok: false, error: e.message };
    throw e;
  }
  if (!q) return { ok: false, error: "Quote not found." };
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setQuoteStatusAction(quoteId: string, status: string) {
  const g = await requireGarage();
  const s = statusSchema.parse(status);
  try {
    await updateQuote(g.id, quoteId, { status: s });
  } catch (e) {
    if (!(e instanceof QuoteLockedError)) throw e;
  }
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath("/dashboard");
}

// ---------- public ----------

export async function acceptQuoteAction(publicId: string, form: FormData) {
  await acceptPublicQuote(publicId, String(form.get("name") ?? ""));
  revalidatePath(`/q/${publicId}`);
}
