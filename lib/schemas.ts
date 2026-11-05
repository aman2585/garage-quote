import { z } from "zod";
import { MAX_LINES } from "./quotes";

export const kindSchema = z.enum(["part", "labour", "service"]);
export const statusSchema = z.enum(["draft", "sent", "accepted"]);

// Lines as edited in the web app (prices in paise).
export const lineSchema = z.object({
  description: z.string().trim().min(1).max(200),
  kind: kindSchema,
  qty: z.number().positive().max(1000),
  unit_price_paise: z.number().int().min(0).max(100_000_000),
  price_item_id: z.string().max(64).nullable().optional(),
});

export const quoteFieldsSchema = z.object({
  customer_name: z.string().trim().min(1).max(100),
  customer_phone: z.string().trim().max(20).nullable().optional(),
  vehicle: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const editorPayloadSchema = quoteFieldsSchema.extend({
  lines: z.array(lineSchema).max(MAX_LINES),
});

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(8).max(200),
});

export const priceItemFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: kindSchema,
  price_rupees: z.coerce.number().min(0).max(1_000_000),
});

export const garageProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(20).optional(),
});
