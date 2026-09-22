import { describe, expect, it } from 'vitest';
import { STAPLES, aggregate, lineKey, normaliseName, normaliseUnit, toPlainText, type AggregateEntry, type ExistingCheckedLine, type ShoppingLine } from './order';
import { formatQuantity } from './recipes';

function entry(overrides: Partial<AggregateEntry> = {}): AggregateEntry {
  return {
    entryId: 1,
    recipeId: 1,
    recipeName: 'Test Dish',
    recipeServings: 4,
    servings: null,
    attendeeCount: 4,
    ingredients: [{ name: 'onion', quantity: 1, unit: 'pcs', aisle: 'produce', optional: false }],
    ...overrides,
  };
}

describe('normaliseName', () => {
  it('lowercases and trims', () => {
    expect(normaliseName('  Onion  ')).toBe('onion');
  });

  it('removes parenthetical notes', () => {
    expect(normaliseName('stock (chicken)')).toBe('stock');
  });

  it('singularizes simple plurals', () => {
    expect(normaliseName('tomatoes')).toBe('tomato');
    expect(normaliseName('onions')).toBe('onion');
    expect(normaliseName('eggs')).toBe('egg');
    expect(normaliseName('potatoes')).toBe('potato');
    expect(normaliseName('carrots')).toBe('carrot');
  });

  it('singularizes the last word of a multi-word name', () => {
    expect(normaliseName('chopped tomatoes')).toBe('chopped tomato');
    expect(normaliseName('chicken breasts')).toBe('chicken breast');
  });

  it('leaves the exception list unchanged (already the base/shopping form)', () => {
    for (const word of ['couscous', 'hummus', 'peas', 'beans', 'lentils', 'oats', 'chips', 'noodles', 'peppers']) {
      expect(normaliseName(word)).toBe(word);
    }
  });

  // Found live against the real seeded week: without this, "peppers" (the
  // vegetable) singularized to "pepper" — byte-for-byte the STAPLES entry
  // for ground black pepper — and a bell pepper got swept into STAPLES.
  it('keeps "peppers" (the vegetable) distinct from the STAPLES entry "pepper" (the seasoning)', () => {
    expect(normaliseName('peppers')).toBe('peppers');
    expect(normaliseName('red peppers')).toBe('red peppers');
    expect(normaliseName('peppers')).not.toBe(normaliseName('pepper'));
  });

  it('leaves an exception word unchanged even as the last word of a longer name', () => {
    expect(normaliseName('frozen peas')).toBe('frozen peas');
    expect(normaliseName('baked beans')).toBe('baked beans');
    expect(normaliseName('egg noodles')).toBe('egg noodles');
  });

  it('leaves an already-singular name unchanged', () => {
    expect(normaliseName('whole chicken')).toBe('whole chicken');
  });
});

// QA, second pass.
describe('normaliseName — irregular plurals', () => {
  it('handles -f/-fe -> -ves plurals', () => {
    expect(normaliseName('leaves')).toBe('leaf');
    expect(normaliseName('bay leaves')).toBe('bay leaf');
    expect(normaliseName('loaves')).toBe('loaf');
    expect(normaliseName('halves')).toBe('half');
    expect(normaliseName('knives')).toBe('knife');
    expect(normaliseName('shelves')).toBe('shelf');
  });

  it('does NOT touch "olives"/"chives"/"cloves" — they end in "ves" but are not this kind of plural', () => {
    expect(normaliseName('olives')).toBe('olives');
    expect(normaliseName('black olives')).toBe('black olives');
    expect(normaliseName('chives')).toBe('chives');
    expect(normaliseName('cloves')).toBe('cloves');
  });

  it('handles -ies -> -y plurals', () => {
    expect(normaliseName('cherries')).toBe('cherry');
    expect(normaliseName('berries')).toBe('berry');
  });

  it('still handles -oes -> -o plurals', () => {
    expect(normaliseName('tomatoes')).toBe('tomato');
    expect(normaliseName('potatoes')).toBe('potato');
  });
});

describe('normaliseUnit', () => {
  it('converts kg to g, x1000', () => {
    expect(normaliseUnit(0.5, 'kg')).toEqual({ quantity: 500, unit: 'g' });
  });

  it('converts l to ml, x1000', () => {
    expect(normaliseUnit(1.5, 'l')).toEqual({ quantity: 1500, unit: 'ml' });
  });

  it('leaves other units unchanged', () => {
    expect(normaliseUnit(2, 'pcs')).toEqual({ quantity: 2, unit: 'pcs' });
    expect(normaliseUnit(200, 'g')).toEqual({ quantity: 200, unit: 'g' });
  });

  it('passes null quantity/unit through', () => {
    expect(normaliseUnit(null, 'g')).toEqual({ quantity: null, unit: 'g' });
    expect(normaliseUnit(5, null)).toEqual({ quantity: 5, unit: null });
  });
});

describe('lineKey', () => {
  it('keeps count and mass separate for the same ingredient', () => {
    expect(lineKey('onion', 'pcs')).not.toBe(lineKey('onion', 'g'));
  });

  it('merges kg and g of the same ingredient', () => {
    expect(lineKey('plain flour', 'g')).toBe(lineKey('plain flour', 'kg'));
  });

  it('merges l and ml of the same ingredient', () => {
    expect(lineKey('milk', 'ml')).toBe(lineKey('milk', 'l'));
  });

  it('merges tsp, tbsp and cup of the same ingredient', () => {
    const a = lineKey('vanilla extract', 'tsp');
    const b = lineKey('vanilla extract', 'tbsp');
    const c = lineKey('vanilla extract', 'cup');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('keeps different count units separate (clove vs pcs are not interchangeable)', () => {
    expect(lineKey('garlic', 'clove')).not.toBe(lineKey('garlic', 'pcs'));
  });

  it('merges every vague unit (pinch, handful, null) together', () => {
    const a = lineKey('salt', null);
    const b = lineKey('salt', 'pinch');
    const c = lineKey('salt', 'handful');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe('aggregate — scaling by covers', () => {
  it('scales an ingredient by entry.servings ?? attendeeCount over the recipe\'s own servings', () => {
    const lines = aggregate(
      [
        entry({
          recipeServings: 4,
          attendeeCount: 1,
          servings: null,
          ingredients: [{ name: 'chicken breast', quantity: 500, unit: 'g', aisle: 'meat-fish', optional: false }],
        }),
      ],
      []
    );
    // 500g for 4 servings -> 1 cover: scaleQuantity's raw 125g rounds to the
    // nearest 10g step (>=100g) -> 130g.
    expect(lines).toHaveLength(1);
    expect(lines[0].unit).toBe('g');
    expect(lines[0].quantity).toBe(130);
  });

  it('uses entry.servings over attendeeCount when set', () => {
    const lines = aggregate(
      [
        entry({
          recipeServings: 4,
          attendeeCount: 1,
          servings: 8,
          ingredients: [{ name: 'rice', quantity: 200, unit: 'g', aisle: 'pantry', optional: false }],
        }),
      ],
      []
    );
    expect(lines[0].quantity).toBe(400); // 200g x (8/4)
  });
});

describe('aggregate — merging', () => {
  it('merges the same ingredient across two dishes and lists both as sources', () => {
    const lines = aggregate(
      [
        entry({
          entryId: 1,
          recipeId: 3,
          recipeName: 'Chicken Fajitas',
          recipeServings: 4,
          attendeeCount: 4,
          ingredients: [{ name: 'chicken breasts', quantity: 500, unit: 'g', aisle: 'meat-fish', optional: false }],
        }),
        entry({
          entryId: 2,
          recipeId: 9,
          recipeName: 'Mild Chicken Curry',
          recipeServings: 4,
          attendeeCount: 4,
          ingredients: [{ name: 'chicken breast', quantity: 300, unit: 'g', aisle: 'meat-fish', optional: false }],
        }),
      ],
      []
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(800);
    expect(lines[0].unit).toBe('g');
    expect(lines[0].sources).toHaveLength(2);
    expect(lines[0].sources.map((s) => s.recipeName).sort()).toEqual(['Chicken Fajitas', 'Mild Chicken Curry']);
  });

  it('halving one source\'s covers halves that source\'s contribution to the merged line', () => {
    const withFullCurry = aggregate(
      [
        entry({
          entryId: 1,
          recipeName: 'Fajitas',
          recipeServings: 4,
          attendeeCount: 4,
          ingredients: [{ name: 'chicken', quantity: 400, unit: 'g', aisle: 'meat-fish', optional: false }],
        }),
        entry({
          entryId: 2,
          recipeName: 'Curry',
          recipeServings: 4,
          attendeeCount: 4,
          ingredients: [{ name: 'chicken', quantity: 400, unit: 'g', aisle: 'meat-fish', optional: false }],
        }),
      ],
      []
    );
    const withHalvedCurry = aggregate(
      [
        entry({
          entryId: 1,
          recipeName: 'Fajitas',
          recipeServings: 4,
          attendeeCount: 4,
          ingredients: [{ name: 'chicken', quantity: 400, unit: 'g', aisle: 'meat-fish', optional: false }],
        }),
        entry({
          entryId: 2,
          recipeName: 'Curry',
          recipeServings: 4,
          attendeeCount: 2,
          ingredients: [{ name: 'chicken', quantity: 400, unit: 'g', aisle: 'meat-fish', optional: false }],
        }),
      ],
      []
    );
    expect(withFullCurry[0].quantity).toBe(800); // 400 + 400
    expect(withHalvedCurry[0].quantity).toBe(600); // 400 + 200
  });

  it('merges kg and g of the same ingredient into one line, displayed sensibly', () => {
    const lines = aggregate(
      [
        entry({
          entryId: 1,
          ingredients: [{ name: 'plain flour', quantity: 200, unit: 'g', aisle: 'bakery', optional: false }],
        }),
        entry({
          entryId: 2,
          ingredients: [{ name: 'plain flour', quantity: 0.5, unit: 'kg', aisle: 'bakery', optional: false }],
        }),
      ],
      []
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(700);
    expect(lines[0].unit).toBe('g');
  });

  it('keeps pcs and g of the same ingredient as two separate lines', () => {
    const lines = aggregate(
      [
        entry({ entryId: 1, ingredients: [{ name: 'ginger', quantity: 1, unit: 'pcs', aisle: 'produce', optional: false }] }),
        entry({ entryId: 2, ingredients: [{ name: 'ginger', quantity: 50, unit: 'g', aisle: 'produce', optional: false }] }),
      ],
      []
    );
    expect(lines).toHaveLength(2);
  });

  it('merges tsp/tbsp/cup of the same ingredient into the largest sensible display unit', () => {
    const lines = aggregate(
      [
        entry({ entryId: 1, ingredients: [{ name: 'olive oil', quantity: 16, unit: 'tbsp', aisle: 'pantry', optional: false }] }),
        entry({ entryId: 2, ingredients: [{ name: 'olive oil', quantity: 16, unit: 'tbsp', aisle: 'pantry', optional: false }] }),
      ],
      []
    );
    // 16 tbsp + 16 tbsp = 32 tbsp = 96 tsp = 2 cups.
    expect(lines).toHaveLength(1);
    expect(lines[0].unit).toBe('cup');
    expect(lines[0].quantity).toBe(2);
  });
});

// QA, second pass: a merged sum used to display as a raw decimal (e.g.
// "2.33 tbsp"), which formatQuantity can't render as a vulgar fraction and
// no kitchen measure actually uses. resolveDisplay now snaps to the same
// steps scaleQuantity itself uses.
describe('aggregate — display rounding snaps to kitchen-sensible steps', () => {
  it('snaps a merged spoon-unit sum to quarter steps: 2 tbsp + 1 tsp -> 2¼ tbsp', () => {
    const lines = aggregate(
      [
        entry({ entryId: 1, ingredients: [{ name: 'vanilla extract', quantity: 2, unit: 'tbsp', aisle: 'pantry', optional: false }] }),
        entry({ entryId: 2, ingredients: [{ name: 'vanilla extract', quantity: 1, unit: 'tsp', aisle: 'pantry', optional: false }] }),
      ],
      []
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].unit).toBe('tbsp');
    expect(lines[0].quantity).toBe(2.25);
    expect(formatQuantity(lines[0].quantity, lines[0].unit ?? '')).toBe('2¼ tbsp');
  });

  it('snaps a merged spoon-unit sum to quarter steps: 1 cup + 8 tbsp -> 1½ cup', () => {
    const lines = aggregate(
      [
        entry({ entryId: 1, ingredients: [{ name: 'flour', quantity: 1, unit: 'cup', aisle: 'bakery', optional: false }] }),
        entry({ entryId: 2, ingredients: [{ name: 'flour', quantity: 8, unit: 'tbsp', aisle: 'bakery', optional: false }] }),
      ],
      []
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].unit).toBe('cup');
    expect(lines[0].quantity).toBe(1.5);
    expect(formatQuantity(lines[0].quantity, lines[0].unit ?? '')).toBe('1½ cup');
  });

  it('displays a merged volume sum >=1000ml in litres to one decimal place: 500 ml + 1 l -> 1.5 l', () => {
    const lines = aggregate(
      [
        entry({ entryId: 1, ingredients: [{ name: 'stock', quantity: 500, unit: 'ml', aisle: 'pantry', optional: false }] }),
        entry({ entryId: 2, ingredients: [{ name: 'stock', quantity: 1, unit: 'l', aisle: 'pantry', optional: false }] }),
      ],
      []
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].unit).toBe('l');
    expect(lines[0].quantity).toBe(1.5);
  });

  it('snaps a merged mass sum to the nearest 10g step once the SUM itself reaches 100g, even when each contribution was already exact for its own smaller bracket', () => {
    const lines = aggregate(
      [
        entry({ entryId: 1, ingredients: [{ name: 'flour', quantity: 95, unit: 'g', aisle: 'bakery', optional: false }] }),
        entry({ entryId: 2, ingredients: [{ name: 'flour', quantity: 90, unit: 'g', aisle: 'bakery', optional: false }] }),
      ],
      []
    );
    // 95 + 90 = 185 -> the SUM (185) is >=100, so it snaps to the nearest 10 -> 190.
    expect(lines[0].quantity).toBe(190);
    expect(lines[0].unit).toBe('g');
  });

  it('snaps a merged volume sum to the nearest 10ml step once the SUM itself reaches 100ml', () => {
    const lines = aggregate(
      [
        entry({ entryId: 1, ingredients: [{ name: 'lemon juice', quantity: 65, unit: 'ml', aisle: 'produce', optional: false }] }),
        entry({ entryId: 2, ingredients: [{ name: 'lemon juice', quantity: 70, unit: 'ml', aisle: 'produce', optional: false }] }),
      ],
      []
    );
    // 65 + 70 = 135 -> >=100 -> nearest 10 -> 140.
    expect(lines[0].quantity).toBe(140);
    expect(lines[0].unit).toBe('ml');
  });
});

describe('aggregate — checked carry-over', () => {
  it('carries over checked from an existing item with the same key', () => {
    const withoutCarry = aggregate([entry()], []);
    const key = withoutCarry[0].key as string;
    expect(withoutCarry[0].checked).toBe(false);

    const withCarry = aggregate([entry()], [{ key, checked: true }]);
    expect(withCarry[0].checked).toBe(true);
  });

  it('a line with no matching existing key starts unchecked', () => {
    const lines = aggregate([entry()], [{ key: 'something-else|g', checked: true }]);
    expect(lines[0].checked).toBe(false);
  });

  it('ignores manual-shaped existing rows (key: null) without erroring', () => {
    const lines = aggregate([entry()], [{ key: null, checked: true }]);
    expect(lines[0].checked).toBe(false);
    expect(lines.every((l) => !l.manual)).toBe(true);
  });
});

// QA, second pass, product decision: editing a generated line no longer
// duplicates it as a manual line — it overrides the generated one in place.
describe('aggregate — overridden lines', () => {
  it('an overridden line survives regeneration unchanged (name/quantity/unit/aisle/checked) except its sources, which refresh', () => {
    const entries = [
      entry({
        entryId: 1,
        recipeId: 9,
        recipeName: 'Updated Recipe Name',
        ingredients: [{ name: 'onion', quantity: 3, unit: 'pcs', aisle: 'produce', optional: false }],
      }),
    ];
    const key = aggregate(entries, [])[0].key as string;

    const existing: ExistingCheckedLine[] = [
      {
        key,
        checked: true,
        overridden: true,
        name: 'Red onion (user edit)',
        quantity: 99,
        unit: 'g',
        aisle: 'household',
      },
    ];
    const lines = aggregate(entries, existing);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      key,
      name: 'Red onion (user edit)',
      quantity: 99,
      unit: 'g',
      aisle: 'household',
      checked: true,
      overridden: true,
      manual: false,
    });
    // Sources still refresh to whatever currently contributes to this key.
    expect(lines[0].sources).toHaveLength(1);
    expect(lines[0].sources[0].recipeName).toBe('Updated Recipe Name');
  });

  it('undo (overridden: false) then regenerate restores the computed values', () => {
    const entries = [
      entry({ entryId: 1, ingredients: [{ name: 'onion', quantity: 3, unit: 'pcs', aisle: 'produce', optional: false }] }),
    ];
    const key = aggregate(entries, [])[0].key as string;
    const computed = aggregate(entries, []);

    // Undo just clears the flag — checked is still whatever it was.
    const existingAfterUndo: ExistingCheckedLine[] = [{ key, checked: true, overridden: false }];
    const lines = aggregate(entries, existingAfterUndo);
    expect(lines[0].overridden).toBe(false);
    expect(lines[0].name).toBe(computed[0].name);
    expect(lines[0].quantity).toBe(computed[0].quantity);
    expect(lines[0].unit).toBe(computed[0].unit);
    expect(lines[0].aisle).toBe(computed[0].aisle);
    expect(lines[0].checked).toBe(true); // checked is independent of overridden
  });

  it('removes an overridden line once its key no longer exists in the plan (the dish left the pass)', () => {
    // No entries at all this time -> the key this override was attached to
    // simply isn't produced any more.
    const existing: ExistingCheckedLine[] = [
      { key: 'onion|pcs', checked: false, overridden: true, name: 'Onion (edited)', quantity: 5, unit: 'pcs', aisle: 'produce' },
    ];
    const lines = aggregate([], existing);
    expect(lines).toHaveLength(0);
  });

  it('a non-overridden line ignores the existing row\'s name/quantity — only checked carries over', () => {
    const entries = [
      entry({ entryId: 1, ingredients: [{ name: 'onion', quantity: 3, unit: 'pcs', aisle: 'produce', optional: false }] }),
    ];
    const key = aggregate(entries, [])[0].key as string;
    const lines = aggregate(entries, [{ key, checked: true, overridden: false, name: 'Should be ignored', quantity: 1, unit: 'g', aisle: 'household' }]);
    expect(lines[0].name).toBe('onion');
    expect(lines[0].checked).toBe(true);
  });
});

// QA, second pass.
describe('aggregate — zero-quantity entries', () => {
  it('an entry with zero attendees and no servings override contributes nothing for a non-vague ingredient', () => {
    const lines = aggregate(
      [entry({ attendeeCount: 0, servings: null, ingredients: [{ name: 'onion', quantity: 3, unit: 'pcs', aisle: 'produce', optional: false }] })],
      []
    );
    expect(lines).toHaveLength(0);
  });

  it('keeps a vague-unit line even with zero attendees ("0 covers" does not make a pinch of salt unnecessary)', () => {
    const lines = aggregate(
      [entry({ attendeeCount: 0, servings: null, ingredients: [{ name: 'salt', quantity: null, unit: null, aisle: 'spices', optional: true }] })],
      []
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBeNull();
  });

  it('a zero-attendee entry contributes nothing to a merged line, leaving only the non-zero contributor\'s amount', () => {
    const lines = aggregate(
      [
        entry({ entryId: 1, attendeeCount: 0, servings: null, ingredients: [{ name: 'onion', quantity: 3, unit: 'pcs', aisle: 'produce', optional: false }] }),
        entry({ entryId: 2, attendeeCount: 4, servings: null, ingredients: [{ name: 'onion', quantity: 2, unit: 'pcs', aisle: 'produce', optional: false }] }),
      ],
      []
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
    expect(lines[0].sources).toHaveLength(1); // the zero-attendee entry left no source behind
  });
});

describe('aggregate — optional', () => {
  it('is optional only when every source marks it optional', () => {
    const allOptional = aggregate(
      [
        entry({ entryId: 1, ingredients: [{ name: 'cream', quantity: 100, unit: 'ml', aisle: 'dairy-eggs', optional: true }] }),
        entry({ entryId: 2, ingredients: [{ name: 'cream', quantity: 100, unit: 'ml', aisle: 'dairy-eggs', optional: true }] }),
      ],
      []
    );
    expect(allOptional[0].optional).toBe(true);

    const mixed = aggregate(
      [
        entry({ entryId: 1, ingredients: [{ name: 'cream', quantity: 100, unit: 'ml', aisle: 'dairy-eggs', optional: true }] }),
        entry({ entryId: 2, ingredients: [{ name: 'cream', quantity: 100, unit: 'ml', aisle: 'dairy-eggs', optional: false }] }),
      ],
      []
    );
    expect(mixed[0].optional).toBe(false);
  });
});

describe('aggregate — staples', () => {
  it('forces a staple ingredient onto the STAPLES block with aisle pantry, regardless of its recipe aisle', () => {
    const lines = aggregate(
      [entry({ ingredients: [{ name: 'salt', quantity: 1, unit: 'pinch', aisle: 'spices', optional: false }] })],
      []
    );
    expect(lines[0].staple).toBe(true);
    expect(lines[0].aisle).toBe('pantry');
  });

  it('every STAPLES entry is recognised', () => {
    for (const name of STAPLES) {
      const lines = aggregate([entry({ ingredients: [{ name, quantity: 1, unit: 'pcs', aisle: 'produce', optional: false }] })], []);
      expect(lines[0].staple).toBe(true);
    }
  });

  it('does not treat bell peppers as the STAPLES "pepper" seasoning', () => {
    const lines = aggregate(
      [entry({ ingredients: [{ name: 'peppers', quantity: 3, unit: 'pcs', aisle: 'produce', optional: false }] })],
      []
    );
    expect(lines[0].staple).toBe(false);
    expect(lines[0].aisle).toBe('produce');
    expect(lines[0].name).toBe('peppers');
  });

  it('does not treat a compound name containing a staple word as a staple', () => {
    const lines = aggregate(
      [entry({ ingredients: [{ name: 'salt and pepper', quantity: null, unit: null, aisle: 'spices', optional: true }] })],
      []
    );
    expect(lines[0].staple).toBe(false);
  });

  it('a vague quantity (no unit) merges as "to taste"', () => {
    const lines = aggregate(
      [
        entry({ entryId: 1, ingredients: [{ name: 'salt and pepper', quantity: null, unit: null, aisle: 'spices', optional: true }] }),
        entry({ entryId: 2, ingredients: [{ name: 'salt and pepper', quantity: null, unit: null, aisle: 'spices', optional: true }] }),
      ],
      []
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBeNull();
    expect(lines[0].sources).toHaveLength(2);
  });
});

describe('aggregate — sorting', () => {
  it('sorts by AISLE_ORDER then name, with staples last', () => {
    const lines = aggregate(
      [
        entry({
          entryId: 1,
          ingredients: [
            { name: 'salt', quantity: 1, unit: 'pinch', aisle: 'spices', optional: false },
            { name: 'milk', quantity: 200, unit: 'ml', aisle: 'dairy-eggs', optional: false },
            { name: 'carrot', quantity: 1, unit: 'pcs', aisle: 'produce', optional: false },
            { name: 'bread', quantity: 1, unit: 'pcs', aisle: 'bakery', optional: false },
          ],
        }),
      ],
      []
    );
    const order = lines.map((l) => l.aisle);
    expect(order.indexOf('produce')).toBeLessThan(order.indexOf('bakery'));
    expect(order.indexOf('bakery')).toBeLessThan(order.indexOf('dairy-eggs'));
    expect(lines[lines.length - 1].staple).toBe(true); // salt is a staple, always last
  });
});

function line(overrides: Partial<ShoppingLine> = {}): ShoppingLine {
  return {
    key: 'onion|pcs',
    name: 'onion',
    quantity: 2,
    unit: 'pcs',
    aisle: 'produce',
    checked: false,
    manual: false,
    optional: false,
    staple: false,
    overridden: false,
    sources: [],
    ...overrides,
  };
}

describe('toPlainText', () => {
  it('renders the header, aisle headings in caps and [ ]/[x] boxes', () => {
    const text = toPlainText(
      [
        line({ name: 'onion', quantity: 2, unit: 'pcs', aisle: 'produce', checked: false }),
        line({ name: 'chicken breast', quantity: 500, unit: 'g', aisle: 'meat-fish', checked: true }),
      ],
      'WEEK OF MON 22 SEP 2026'
    );
    expect(text).toContain('THE RICE KITCHEN');
    expect(text).toContain('SUPPLIER ORDER');
    expect(text).toContain('WEEK OF MON 22 SEP 2026');
    expect(text).toContain('PRODUCE');
    expect(text).toContain('[ ] onion — 2 pcs');
    expect(text).toContain('MEAT-FISH');
    expect(text).toContain('[x] chicken breast — 500 g');
  });

  it('groups staples into their own STAPLES section at the end', () => {
    const text = toPlainText(
      [line({ name: 'onion', aisle: 'produce', staple: false }), line({ key: 'salt|vague', name: 'salt', quantity: null, unit: null, aisle: 'pantry', staple: true })],
      'WEEK OF MON 22 SEP 2026'
    );
    const staplesIndex = text.indexOf('STAPLES');
    const produceIndex = text.indexOf('PRODUCE');
    expect(staplesIndex).toBeGreaterThan(produceIndex);
    expect(text).toContain('[ ] salt — to taste');
  });

  it('marks an optional line', () => {
    const text = toPlainText([line({ optional: true })], 'WEEK OF MON 22 SEP 2026');
    expect(text).toContain('(optional)');
  });

  it('summarises total and ticked line counts', () => {
    const text = toPlainText([line({ checked: true }), line({ key: 'carrot|pcs', name: 'carrot', checked: false })], 'W');
    expect(text).toContain('2 LINES · 1 TICKED');
  });

  // QA, second pass: a manual line never goes under STAPLES even when its
  // name happens to match one — it always gets its own ADDED section,
  // matching the receipt's own on-screen grouping.
  it('never puts a manual line under STAPLES, even when its name matches one — it goes under ADDED instead', () => {
    const text = toPlainText(
      [
        line({ key: null, name: 'salt', quantity: null, unit: null, aisle: 'pantry', staple: true, manual: true }),
        line({ key: 'olive oil|tsp', name: 'olive oil', quantity: 6, unit: 'tsp', aisle: 'pantry', staple: true, manual: false }),
      ],
      'WEEK OF MON 22 SEP 2026'
    );
    const staplesIndex = text.indexOf('STAPLES');
    const addedIndex = text.indexOf('ADDED');
    expect(staplesIndex).toBeGreaterThan(-1);
    expect(addedIndex).toBeGreaterThan(staplesIndex);
    // "salt" (manual) appears after the ADDED heading, not inside STAPLES.
    const saltIndex = text.indexOf('] salt');
    expect(saltIndex).toBeGreaterThan(addedIndex);
    // "olive oil" (generated) is the one genuinely under STAPLES.
    const oliveIndex = text.indexOf('] olive oil');
    expect(oliveIndex).toBeGreaterThan(staplesIndex);
    expect(oliveIndex).toBeLessThan(addedIndex);
  });
});
