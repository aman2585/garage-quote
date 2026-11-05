import { randomBytes } from "node:crypto";
import { db } from "./db";
import { lineTotalPaise } from "./money";

export type Kind = "part" | "labour" | "service";
export type Status = "draft" | "sent" | "accepted";

export type PriceItem = {
  id: string;
  name: string;
  kind: Kind;
  unit_price_paise: number;
  active: boolean;
};

export type LineInput = {
  description: string;
  kind: Kind;
  qty: number;
  unit_price_paise: number;
  price_item_id?: string | null;
};

export type QuoteFields = {
  customer_name: string;
  customer_phone?: string | null;
  vehicle: string;
  notes?: string | null;
};

export type QuoteLine = LineInput & { id: string; position: number; price_item_id: string | null };

export type Quote = {
  id: string;
  seq: number; // the per-garage quote number shown as Q-<seq> (column `number`)
  number: number;
  public_id: string;
  customer_name: string;
  customer_phone: string | null;
  vehicle: string;
  notes: string | null;
  status: Status;
  created_by: "claude" | "garage";
  accepted_at: Date | null;
  accepted_by_name: string | null;
  created_at: Date;
  updated_at: Date;
};

export type QuoteWithLines = Quote & { lines: QuoteLine[]; total_paise: number };

export const MAX_LINES = 50;

export class QuoteLockedError extends Error {
  constructor() {
    super("This quote was accepted by the customer, so it can't be changed. Create a new quote instead.");
  }
}

function totalOf(lines: { qty: number; unit_price_paise: number }[]): number {
  return lines.reduce((sum, l) => sum + lineTotalPaise(l.qty, l.unit_price_paise), 0);
}

// ---------- price list ----------

export async function listPriceItems(garageId: string, query?: string, includeInactive = false) {
  const sql = await db();
  const q = query?.trim();
  return sql<PriceItem[]>`
    select id, name, kind, unit_price_paise, active from price_items
    where garage_id = ${garageId}
      ${includeInactive ? sql`` : sql`and active`}
      ${q ? sql`and name ilike ${"%" + q.replace(/[%_]/g, "") + "%"}` : sql``}
    order by kind, name
    limit 200`;
}

export async function upsertPriceItems(
  garageId: string,
  items: { name: string; kind: Kind; unit_price_paise: number }[],
) {
  const sql = await db();
  const saved: PriceItem[] = [];
  for (const it of items) {
    const [row] = await sql<PriceItem[]>`
      insert into price_items (garage_id, name, kind, unit_price_paise)
      values (${garageId}, ${it.name.trim()}, ${it.kind}, ${it.unit_price_paise})
      on conflict (garage_id, (lower(name))) do update
        set kind = excluded.kind, unit_price_paise = excluded.unit_price_paise, active = true
      returning id, name, kind, unit_price_paise, active`;
    saved.push(row);
  }
  return saved;
}

export async function updatePriceItem(
  garageId: string,
  id: string,
  fields: { name: string; kind: Kind; unit_price_paise: number; active: boolean },
) {
  const sql = await db();
  await sql`
    update price_items set name = ${fields.name.trim()}, kind = ${fields.kind},
      unit_price_paise = ${fields.unit_price_paise}, active = ${fields.active}
    where id = ${id} and garage_id = ${garageId}`;
}

// ---------- quotes ----------

async function ownedPriceItemIds(sql: Awaited<ReturnType<typeof db>>, garageId: string, ids: string[]) {
  if (ids.length === 0) return new Set<string>();
  const rows = await sql<{ id: string }[]>`
    select id from price_items where garage_id = ${garageId} and id = any(${ids}::uuid[])`;
  return new Set(rows.map((r) => r.id));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function writeLines(
  tx: Awaited<ReturnType<typeof db>>,
  garageId: string,
  quoteId: string,
  lines: LineInput[],
) {
  const candidateIds = lines.map((l) => l.price_item_id).filter((x): x is string => !!x && UUID.test(x));
  const owned = await ownedPriceItemIds(tx, garageId, candidateIds);
  await tx`delete from quote_lines where quote_id = ${quoteId}`;
  let pos = 0;
  for (const l of lines) {
    const itemId = l.price_item_id && owned.has(l.price_item_id) ? l.price_item_id : null;
    await tx`
      insert into quote_lines (quote_id, position, description, kind, qty, unit_price_paise, price_item_id)
      values (${quoteId}, ${pos++}, ${l.description.trim()}, ${l.kind}, ${l.qty}, ${l.unit_price_paise}, ${itemId})`;
  }
}

export async function createQuote(
  garageId: string,
  fields: QuoteFields,
  lines: LineInput[],
  createdBy: "claude" | "garage",
): Promise<QuoteWithLines> {
  const sql = await db();
  const publicId = randomBytes(16).toString("base64url");
  const id = await sql.begin(async (tx) => {
    // One quote at a time per garage, so the per-garage number never repeats.
    await tx`select pg_advisory_xact_lock(hashtext(${garageId}::text))`;
    const [q] = await tx<{ id: string }[]>`
      insert into quotes (garage_id, number, public_id, customer_name, customer_phone, vehicle, notes, created_by)
      values (${garageId}, (select coalesce(max(number), 0) + 1 from quotes where garage_id = ${garageId}),
              ${publicId}, ${fields.customer_name.trim()}, ${fields.customer_phone?.trim() || null},
              ${fields.vehicle.trim()}, ${fields.notes?.trim() || null}, ${createdBy})
      returning id`;
    await writeLines(tx as unknown as Awaited<ReturnType<typeof db>>, garageId, q.id, lines);
    return q.id;
  });
  return (await getQuote(garageId, id))!;
}

export async function updateQuote(
  garageId: string,
  quoteId: string,
  fields: Partial<QuoteFields> & { status?: Status },
  lines?: LineInput[],
): Promise<QuoteWithLines | null> {
  if (!UUID.test(quoteId)) return null;
  const sql = await db();
  const ok = await sql.begin(async (tx) => {
    const [existing] = await tx<{ id: string; status: Status }[]>`
      select id, status from quotes where id = ${quoteId} and garage_id = ${garageId} for update`;
    if (!existing) return false;
    if (existing.status === "accepted") throw new QuoteLockedError();
    const set: Record<string, unknown> = {};
    if (fields.customer_name !== undefined) set.customer_name = fields.customer_name.trim();
    if (fields.customer_phone !== undefined) set.customer_phone = fields.customer_phone?.trim() || null;
    if (fields.vehicle !== undefined) set.vehicle = fields.vehicle.trim();
    if (fields.notes !== undefined) set.notes = fields.notes?.trim() || null;
    if (fields.status !== undefined) set.status = fields.status;
    if (Object.keys(set).length > 0) {
      await tx`update quotes set ${tx(set)}, updated_at = now() where id = ${quoteId}`;
    } else {
      await tx`update quotes set updated_at = now() where id = ${quoteId}`;
    }
    if (lines) await writeLines(tx as unknown as Awaited<ReturnType<typeof db>>, garageId, quoteId, lines);
    return true;
  });
  return ok ? getQuote(garageId, quoteId) : null;
}

async function linesFor(quoteId: string): Promise<QuoteLine[]> {
  const sql = await db();
  const rows = await sql<(QuoteLine & { qty: string })[]>`
    select id, position, description, kind, qty, unit_price_paise, price_item_id
    from quote_lines where quote_id = ${quoteId} order by position`;
  return rows.map((r) => ({ ...r, qty: Number(r.qty) }));
}

export async function getQuote(garageId: string, quoteId: string): Promise<QuoteWithLines | null> {
  if (!UUID.test(quoteId)) return null;
  const sql = await db();
  const [q] = await sql<Quote[]>`select * from quotes where id = ${quoteId} and garage_id = ${garageId}`;
  if (!q) return null;
  const lines = await linesFor(q.id);
  return { ...q, seq: Number(q.number), lines, total_paise: totalOf(lines) };
}

// Accepts a quote's uuid or its human number ("Q-12" or "12") and returns the uuid.
export async function resolveQuoteRef(garageId: string, ref: string): Promise<string | null> {
  const r = ref.trim();
  if (UUID.test(r)) return r;
  const m = r.match(/^(?:q-?)?(\d{1,9})$/i);
  if (!m) return null;
  const sql = await db();
  const [row] = await sql<{ id: string }[]>`
    select id from quotes where garage_id = ${garageId} and number = ${Number(m[1])}`;
  return row?.id ?? null;
}

export type QuoteSummary = Quote & { total_paise: number; line_count: number };

export async function listQuotes(garageId: string, status?: Status, limit = 50): Promise<QuoteSummary[]> {
  const sql = await db();
  const rows = await sql<(Quote & { total_paise: string | null; line_count: string })[]>`
    select q.*,
      (select coalesce(sum(round(l.qty * l.unit_price_paise)), 0) from quote_lines l where l.quote_id = q.id) as total_paise,
      (select count(*) from quote_lines l where l.quote_id = q.id) as line_count
    from quotes q
    where q.garage_id = ${garageId} ${status ? sql`and q.status = ${status}` : sql``}
    order by q.created_at desc
    limit ${Math.min(Math.max(limit, 1), 100)}`;
  return rows.map((r) => ({
    ...r,
    seq: Number(r.number),
    total_paise: Number(r.total_paise ?? 0),
    line_count: Number(r.line_count),
  }));
}

export type PublicQuote = QuoteWithLines & { garage_name: string; garage_phone: string | null; garage_city: string | null };

export async function getPublicQuote(publicId: string): Promise<PublicQuote | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(publicId)) return null;
  const sql = await db();
  const [q] = await sql<(Quote & { garage_name: string; garage_phone: string | null; garage_city: string | null })[]>`
    select q.*, g.name as garage_name, g.phone as garage_phone, g.city as garage_city
    from quotes q join garages g on g.id = q.garage_id
    where q.public_id = ${publicId}`;
  if (!q) return null;
  const lines = await linesFor(q.id);
  return { ...q, seq: Number(q.number), lines, total_paise: totalOf(lines) };
}

export async function acceptPublicQuote(publicId: string, name: string | null): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(publicId)) return false;
  const sql = await db();
  const rows = await sql`
    update quotes set status = 'accepted', accepted_at = now(),
      accepted_by_name = ${name?.trim().slice(0, 80) || null}, updated_at = now()
    where public_id = ${publicId} and status in ('draft','sent')
    returning id`;
  return rows.length > 0;
}
