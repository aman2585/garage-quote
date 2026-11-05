# GarageQuote

Quotes for independent garages, drafted in the garage owner's own Claude and shared with the car owner as a live link.

- The garage connects **their own Claude** to GarageQuote through MCP (a custom connector).
- Claude does the thinking: it turns "2017 Swift, brake noise, wants AC service" into line items, using the garage's price list first.
- GarageQuote does everything else: stores the quote, lets the garage edit it, and serves a public link the customer opens to view and accept.
- **No AI inside the app.** No AI SDKs, no AI API keys, no AI cost. `scripts/check-no-ai.mjs` runs before every build and fails it if any appear.

## Stack
Next.js 16 (App Router) on Vercel, Postgres (Neon), `mcp-handler` for the MCP endpoint. Tables are created automatically on first request.

## Environment variables
| Name | What |
|---|---|
| `DATABASE_URL` | Postgres connection string (Neon pooled URL; added automatically by the Vercel Neon integration) |

That is the only variable the app needs. The key that signs login cookies is generated on first run and stored in the database (`SESSION_SECRET`, if set, overrides it).

## Run locally
```bash
npm install
DATABASE_URL=postgres://... npm run dev
```

## Connect Claude
1. Sign up in the app. The dashboard shows your private MCP link: `https://<app>/api/g/<secret>/mcp`.
2. In Claude: **Customize → Connectors → Add custom connector**, paste the link, leave sign-in empty, click **Add**.
3. In a new chat, enable GarageQuote from the **+** menu and ask Claude to make a quote.

The secret in the link identifies the garage. Keep it private; you can replace it from the dashboard. A production version would use OAuth sign-in instead.
