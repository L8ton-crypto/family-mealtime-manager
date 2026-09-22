import { z } from 'zod';
import { AISLES, UNITS } from './vocab';
import { isValidISODate } from './dates';

// Same "shape AND real calendar date" rule every other date-accepting schema
// in this codebase uses — see plan-schema.ts's isoDateSchema doc comment.
const weekSchema = z.string().refine(isValidISODate, 'week must be a real YYYY-MM-DD calendar date');

export const orderWeekQuerySchema = z.object({ week: weekSchema });

export const generateOrderSchema = z.object({ week: weekSchema });

export const createManualLineSchema = z.object({
  week: weekSchema,
  name: z.string().trim().min(1).max(120),
  quantity: z.number().finite().nullable().optional().default(null),
  unit: z.enum(UNITS).nullable().optional().default(null),
  aisle: z.enum(AISLES).optional().default('pantry'),
});

// `overridden` only ever accepts `false` from a client — a PATCH can clear
// an override ("Undo edit"), never set one directly. A line becomes
// overridden as a SIDE EFFECT of patching name/quantity/unit/aisle on a
// still-generated line (see order-db.ts's patchOrderItem), not by the
// client asserting the flag itself.
export const patchOrderItemSchema = z.object({
  checked: z.boolean().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  quantity: z.number().finite().nullable().optional(),
  unit: z.enum(UNITS).nullable().optional(),
  aisle: z.enum(AISLES).optional(),
  overridden: z.literal(false).optional(),
});

export const clearOrderSchema = z.object({
  week: weekSchema,
  checkedOnly: z.literal(true),
});

export type CreateManualLineInput = z.infer<typeof createManualLineSchema>;
export type PatchOrderItemInput = z.infer<typeof patchOrderItemSchema>;
