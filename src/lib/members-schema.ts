import { z } from 'zod';

// Age groups and preset restriction/allergy tags, per docs/ARCHITECTURE.md.
// Presets are suggestions in the UI; `custom` free-text entries are also
// allowed, so the schema just validates "non-empty string" for tag arrays.
export const AGE_GROUPS = ['baby', 'toddler', 'child', 'teen', 'adult'] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const RESTRICTION_PRESETS = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
  'halal',
  'kosher',
  'pescatarian',
] as const;

export const ALLERGY_PRESETS = [
  'nuts',
  'peanuts',
  'dairy',
  'eggs',
  'gluten',
  'soy',
  'fish',
  'shellfish',
  'sesame',
] as const;

export const MEMBER_COLOURS = [
  '#FF4F0F',
  '#21E6A1',
  '#FFE86B',
  '#E11D2E',
  '#5C9DF6',
  '#B983FF',
  '#F27EB3',
  '#F2EFE8',
] as const;

const hexColour = z
  .string()
  .trim()
  .regex(/^#[0-9a-f]{6}$/i, 'Colour must be a hex code like #FF4F0F');

// Normalises every tag to lowercase + trimmed, and drops duplicates
// (case-insensitively) while keeping first-seen order. Presets are already
// lowercase, so this just makes custom entries consistent with them (and
// with each other) — "Nuts", "nuts " and "NUTS" all collapse to one chip.
const tagArray = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .transform((tags) => {
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const tag of tags) {
      const lower = tag.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        normalized.push(lower);
      }
    }
    return normalized;
  });

export const createMemberSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  age_group: z.enum(AGE_GROUPS).default('adult'),
  colour: hexColour.default('#FF4F0F'),
  likes: tagArray.default([]),
  dislikes: tagArray.default([]),
  restrictions: tagArray.default([]),
  allergies: tagArray.default([]),
});

export const patchMemberSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60).optional(),
  age_group: z.enum(AGE_GROUPS).optional(),
  colour: hexColour.optional(),
  likes: tagArray.optional(),
  dislikes: tagArray.optional(),
  restrictions: tagArray.optional(),
  allergies: tagArray.optional(),
  sort_order: z.number().int().optional(),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type PatchMemberInput = z.infer<typeof patchMemberSchema>;
