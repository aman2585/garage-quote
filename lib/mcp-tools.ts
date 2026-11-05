import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { Garage } from "./auth";
import {
  createQuote,
  getQuote,
  listPriceItems,
  listQuotes,
  MAX_LINES,
  resolveQuoteRef,
  updateQuote,
  upsertPriceItems,
  type QuoteWithLines,
} from "./quotes";
import { formatPaise, lineTotalPaise, rupeesToPaise } from "./money";

const kind = z.enum(["part", "labour", "service"]);
const rupees = z.number().min(0).max(1_000_000);

const lineIn = z.object({
  description: z.string().trim().min(1).max(200).describe("What the customer sees, e.g. 'Front brake pads (pair)'"),
  kind: kind.describe("part, labour or service"),
  qty: z.number().positive().max(1000).default(1),
  unit_price_rupees: rupees.describe("Price per unit in Indian rupees (₹). Use the price list price when there is one."),
  price_item_id: z
    .string()
    .max(64)
    .optional()
    .describe("id from search_price_items when this line comes from the garage's price list. Omit if you estimated the price."),
});

const toLines = (lines: z.infer<typeof lineIn>[]) =>
  lines.map((l) => ({
    description: l.description,
    kind: l.kind,
    qty: l.qty,
    unit_price_paise: rupeesToPaise(l.unit_price_rupees),
    price_item_id: l.price_item_id ?? null,
  }));

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

function fail(s: string) {
  return { content: [{ type: "text" as const, text: s }], isError: true };
}

function describeQuote(q: QuoteWithLines, origin: string): string {
  const lines = q.lines.length
    ? q.lines
        .map((l, i) => {
          const amount = formatPaise(lineTotalPaise(l.qty, l.unit_price_paise));
          const src = l.price_item_id ? "from price list" : "NOT in price list: garage should confirm this price";
          return `${i + 1}. ${l.description} (${l.kind}) ${l.qty} × ${formatPaise(l.unit_price_paise)} = ${amount} [${src}]`;
        })
        .join("\n")
    : "(no lines yet)";
  const accepted =
    q.status === "accepted" && q.accepted_at
      ? `\nAccepted by the customer${q.accepted_by_name ? ` (${q.accepted_by_name})` : ""} at ${new Date(q.accepted_at).toISOString()}`
      : "";
  return [
    `Quote Q-${q.seq} · status: ${q.status}${accepted}`,
    `Customer: ${q.customer_name}${q.customer_phone ? ` (${q.customer_phone})` : ""}`,
    `Vehicle: ${q.vehicle}`,
    q.notes ? `Notes: ${q.notes}` : null,
    "",
    lines,
    "",
    `Total: ${formatPaise(q.total_paise)}`,
    "",
    `Garage edit page (login needed): ${origin}/quotes/${q.id}`,
    `Customer link (share with the car owner): ${origin}/q/${q.public_id}`,
    `quote_id: ${q.id}`,
  ]
    .filter((x) => x !== null)
    .join("\n");
}

export function serverInstructions(g: Garage): string {
  return [
    `You are connected to GarageQuote for the garage "${g.name}"${g.city ? ` in ${g.city}` : ""}.`,
    "GarageQuote stores quotes (estimates) for car repairs and gives each one a live link the car owner can open and accept.",
    "When the garage owner describes a car and a job: first call search_price_items to find the garage's own prices,",
    "then call create_quote with clear line items. Prefer price-list items and pass their price_item_id.",
    "If an item is not in the price list, you may estimate a price, but tell the owner which lines are estimates;",
    "the app flags them for the owner to check. Never invent a customer's phone number.",
    "After creating a quote, give the owner the edit page and the customer link.",
    "Prices are in Indian rupees. Totals are calculated by the app from the lines.",
  ].join(" ");
}

export function registerTools(server: McpServer, g: Garage, origin: string) {
  server.registerTool(
    "search_price_items",
    {
      title: "Search price list",
      description:
        "Search this garage's own price list (parts, labour and services with their prices). Call this before drafting a quote. Leave query empty to list everything.",
      inputSchema: z.object({
        query: z.string().max(80).optional().describe("Word to match in the item name, e.g. 'brake' or 'AC'"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query }) => {
      const items = await listPriceItems(g.id, query);
      if (items.length === 0) {
        const all = query ? await listPriceItems(g.id) : [];
        return text(
          query && all.length
            ? `No price-list items match "${query}". The garage has ${all.length} items; search with another word or leave query empty.`
            : "The price list is empty. You can estimate prices (they will be flagged for the garage to check), or ask the owner for their rates and save them with save_price_items.",
        );
      }
      return text(
        items.map((it) => `- ${it.name} (${it.kind}): ₹${it.unit_price_paise / 100} · price_item_id: ${it.id}`).join("\n"),
      );
    },
  );

  server.registerTool(
    "save_price_items",
    {
      title: "Save price list items",
      description:
        "Add items to this garage's price list, or update the price of an item with the same name. Use it when the owner shares their rate card. Only save prices the owner gave you.",
      inputSchema: z.object({
        items: z
          .array(z.object({ name: z.string().trim().min(1).max(120), kind, price_rupees: rupees }))
          .min(1)
          .max(100),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ items }) => {
      const saved = await upsertPriceItems(
        g.id,
        items.map((i) => ({ name: i.name, kind: i.kind, unit_price_paise: rupeesToPaise(i.price_rupees) })),
      );
      return text(
        `Saved ${saved.length} item(s) to the price list:\n` +
          saved.map((s) => `- ${s.name} (${s.kind}): ₹${s.unit_price_paise / 100}`).join("\n") +
          `\nThe owner can review them at ${origin}/prices`,
      );
    },
  );

  server.registerTool(
    "create_quote",
    {
      title: "Create quote",
      description:
        "Create a new draft quote for a customer's vehicle. Returns the garage's edit page and the customer link. The garage reviews it before sharing.",
      inputSchema: z.object({
        customer_name: z.string().trim().min(1).max(100),
        customer_phone: z.string().trim().max(20).optional().describe("Only if the owner gave it"),
        vehicle: z.string().trim().min(1).max(120).describe("Make, model, year and fuel, e.g. '2017 Maruti Swift petrol'"),
        notes: z.string().trim().max(1000).optional().describe("Short note for the customer, e.g. what was found on inspection"),
        lines: z.array(lineIn).min(1).max(MAX_LINES),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ lines, ...fields }) => {
      const q = await createQuote(g.id, fields, toLines(lines), "claude");
      return text(`Created.\n\n${describeQuote(q, origin)}`);
    },
  );

  server.registerTool(
    "update_quote",
    {
      title: "Update quote",
      description:
        "Change an existing quote. Pass only the fields to change. If you pass lines, they replace all existing lines. Set status to 'sent' once the owner has shared it with the customer. Only the customer can accept.",
      inputSchema: z.object({
        quote_id: z.string().max(64).describe("quote_id, or the quote number like 'Q-12'"),
        customer_name: z.string().trim().min(1).max(100).optional(),
        customer_phone: z.string().trim().max(20).optional(),
        vehicle: z.string().trim().min(1).max(120).optional(),
        notes: z.string().trim().max(1000).optional(),
        status: z.enum(["draft", "sent"]).optional(),
        lines: z.array(lineIn).min(1).max(MAX_LINES).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ quote_id, lines, ...fields }) => {
      const id = await resolveQuoteRef(g.id, quote_id);
      const current = id ? await getQuote(g.id, id) : null;
      if (!id || !current) return fail(`No quote "${quote_id}" for this garage. Use list_quotes to find it.`);
      if (current.status === "accepted") {
        return fail(`Q-${current.seq} was already accepted by the customer, so it can't be changed. Create a new quote instead.`);
      }
      const q = await updateQuote(g.id, id, fields, lines ? toLines(lines) : undefined);
      return text(`Updated.\n\n${describeQuote(q!, origin)}`);
    },
  );

  server.registerTool(
    "get_quote",
    {
      title: "Get quote",
      description: "Get one quote with its lines, total and status, including whether the customer has accepted it.",
      inputSchema: z.object({ quote_id: z.string().max(64).describe("quote_id, or the quote number like 'Q-12'") }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ quote_id }) => {
      const id = await resolveQuoteRef(g.id, quote_id);
      const q = id ? await getQuote(g.id, id) : null;
      if (!q) return fail(`No quote "${quote_id}" for this garage. Use list_quotes to find it.`);
      return text(describeQuote(q, origin));
    },
  );

  server.registerTool(
    "list_quotes",
    {
      title: "List quotes",
      description: "List this garage's recent quotes, newest first, with status and total. Filter by status if needed.",
      inputSchema: z.object({
        status: z.enum(["draft", "sent", "accepted"]).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ status, limit }) => {
      const qs = await listQuotes(g.id, status, limit);
      if (qs.length === 0) return text(status ? `No ${status} quotes.` : "No quotes yet.");
      return text(
        qs
          .map(
            (q) =>
              `- Q-${q.seq} · ${q.status} · ${q.customer_name} · ${q.vehicle} · ${formatPaise(q.total_paise)} · ${new Date(q.created_at).toISOString().slice(0, 10)} · quote_id: ${q.id}`,
          )
          .join("\n"),
      );
    },
  );
}
