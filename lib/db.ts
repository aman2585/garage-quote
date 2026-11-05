import { randomBytes } from "node:crypto";
import postgres from "postgres";

// One connection pool per server instance. Neon's pooled URL runs PgBouncer in
// transaction mode, so prepared statements are turned off.
const globalForDb = globalThis as unknown as { _sql?: postgres.Sql; _schema?: Promise<void> };

function client(): postgres.Sql {
  if (!globalForDb._sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb._sql = postgres(url, { max: 5, prepare: false, idle_timeout: 20 });
  }
  return globalForDb._sql;
}

const SCHEMA = `
create table if not exists garages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  phone text,
  email text not null unique,
  password_hash text not null,
  mcp_secret text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists price_items (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('part','labour','service')),
  unit_price_paise integer not null check (unit_price_paise >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists price_items_garage_name on price_items (garage_id, lower(name));
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  garage_id uuid not null references garages(id) on delete cascade,
  public_id text not null unique,
  customer_name text not null,
  customer_phone text,
  vehicle text not null,
  notes text,
  status text not null default 'draft' check (status in ('draft','sent','accepted')),
  created_by text not null check (created_by in ('claude','garage')),
  accepted_at timestamptz,
  accepted_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quotes_garage_created on quotes (garage_id, created_at desc);
alter table quotes add column if not exists number integer;
update quotes q set number = s.n
  from (select id, row_number() over (partition by garage_id order by seq) as n from quotes where number is null) s
  where q.id = s.id and q.number is null;
create unique index if not exists quotes_garage_number on quotes (garage_id, number);
create table if not exists quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  position integer not null,
  description text not null,
  kind text not null default 'service' check (kind in ('part','labour','service')),
  qty numeric(10,2) not null check (qty > 0),
  unit_price_paise integer not null check (unit_price_paise >= 0),
  price_item_id uuid references price_items(id) on delete set null
);
create index if not exists quote_lines_quote on quote_lines (quote_id, position);
create table if not exists app_settings (
  key text primary key,
  value text not null
);
`;

// Creates tables on first use, so a fresh Neon database needs no manual setup.
export async function db(): Promise<postgres.Sql> {
  const sql = client();
  if (!globalForDb._schema) {
    globalForDb._schema = sql.unsafe(SCHEMA).then(() => undefined).catch((e) => {
      globalForDb._schema = undefined;
      throw e;
    });
  }
  await globalForDb._schema;
  return sql;
}

// Key used to sign login cookies. Generated once, stored in the database, so
// deployment needs no secret other than DATABASE_URL. SESSION_SECRET, if set,
// takes priority.
const globalKey = globalThis as unknown as { _sessionKey?: Promise<string> };

export function sessionKey(): Promise<string> {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) return Promise.resolve(fromEnv);
  if (!globalKey._sessionKey) {
    globalKey._sessionKey = (async () => {
      const sql = await db();
      const fresh = randomBytes(32).toString("hex");
      await sql`insert into app_settings (key, value) values ('session_key', ${fresh}) on conflict (key) do nothing`;
      const [row] = await sql<{ value: string }[]>`select value from app_settings where key = 'session_key'`;
      return row.value;
    })().catch((e) => {
      globalKey._sessionKey = undefined;
      throw e;
    });
  }
  return globalKey._sessionKey;
}
