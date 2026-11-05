import { createMcpHandler } from "mcp-handler";
import { db } from "@/lib/db";
import type { Garage } from "@/lib/auth";
import { registerTools, serverInstructions } from "@/lib/mcp-tools";

export const maxDuration = 60;

const SECRET = /^[A-Za-z0-9_-]{32,64}$/;

async function garageForSecret(secret: string): Promise<Garage | null> {
  if (!SECRET.test(secret)) return null;
  const sql = await db();
  const [g] = await sql<Garage[]>`
    select id, name, city, phone, email, mcp_secret from garages where mcp_secret = ${secret}`;
  return g ?? null;
}

function originOf(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

async function handle(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  const garage = await garageForSecret(secret);
  if (!garage) {
    return Response.json({ error: "Unknown MCP link. Copy the current link from your GarageQuote dashboard." }, { status: 404 });
  }
  const origin = originOf(req);
  const handler = createMcpHandler((server) => registerTools(server, garage, origin), {
    serverInfo: { name: "GarageQuote", version: "1.0.0" },
    instructions: serverInstructions(garage),
  });
  return handler(req);
}

export { handle as GET, handle as POST, handle as DELETE };
