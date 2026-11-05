import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, sessionKey } from "./db";

const COOKIE = "gq_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type Garage = {
  id: string;
  name: string;
  city: string | null;
  phone: string | null;
  email: string;
  mcp_secret: string;
};

export function newSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function sign(value: string): Promise<string> {
  return createHmac("sha256", await sessionKey()).update(value).digest("base64url");
}

export async function startSession(garageId: string) {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE;
  const value = `${garageId}.${expires}`;
  (await cookies()).set(COOKIE, `${value}.${await sign(value)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentGarage(): Promise<Garage | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [id, exp, mac] = parts;
  const expected = Buffer.from(await sign(`${id}.${exp}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  const sql = await db();
  const rows = await sql<Garage[]>`
    select id, name, city, phone, email, mcp_secret from garages where id = ${id}`;
  return rows[0] ?? null;
}

export async function requireGarage(): Promise<Garage> {
  const g = await currentGarage();
  if (!g) redirect("/login");
  return g;
}
