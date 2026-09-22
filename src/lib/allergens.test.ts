import { describe, expect, it } from 'vitest';
import { inferAllergens, inferAisle } from './allergens';

describe('inferAllergens', () => {
  it('infers gluten from flour', () => {
    expect(inferAllergens('plain flour')).toContain('gluten');
  });

  it('infers gluten and soy from soy sauce', () => {
    const result = inferAllergens('soy sauce');
    expect(result).toContain('gluten');
    expect(result).toContain('soy');
  });

  it('does not infer nuts from nutmeg', () => {
    expect(inferAllergens('ground nutmeg')).not.toContain('nuts');
  });

  it('does not infer eggs from eggplant', () => {
    expect(inferAllergens('eggplant')).not.toContain('eggs');
  });

  it('does not infer dairy from coconut milk', () => {
    expect(inferAllergens('coconut milk')).not.toContain('dairy');
  });

  it('does not infer dairy from oat milk, almond milk or soy milk', () => {
    expect(inferAllergens('oat milk')).not.toContain('dairy');
    expect(inferAllergens('almond milk')).not.toContain('dairy');
    expect(inferAllergens('soy milk')).not.toContain('dairy');
  });

  it('still infers soy from soy milk (only the dairy match is excepted)', () => {
    expect(inferAllergens('soy milk')).toContain('soy');
  });

  it('still infers nuts from almond milk (only the dairy match is excepted)', () => {
    expect(inferAllergens('almond milk')).toContain('nuts');
  });

  it('infers dairy from plain milk', () => {
    expect(inferAllergens('whole milk')).toContain('dairy');
  });

  it('infers peanuts (not nuts) from peanut butter', () => {
    const result = inferAllergens('peanut butter');
    expect(result).toContain('peanuts');
    expect(result).not.toContain('nuts');
    expect(result).not.toContain('dairy');
  });

  it('does not infer nuts from a plain peanut', () => {
    expect(inferAllergens('peanuts')).not.toContain('nuts');
  });

  it('infers nuts from real tree nuts', () => {
    expect(inferAllergens('flaked almonds')).toContain('nuts');
    expect(inferAllergens('chopped walnuts')).toContain('nuts');
    expect(inferAllergens('cashew nuts')).toContain('nuts');
  });

  it('infers dairy from cheese, butter, cream and yogurt', () => {
    expect(inferAllergens('cheddar cheese')).toContain('dairy');
    expect(inferAllergens('unsalted butter')).toContain('dairy');
    expect(inferAllergens('double cream')).toContain('dairy');
    expect(inferAllergens('greek yogurt')).toContain('dairy');
  });

  it('does not infer dairy from cocoa butter or apple butter', () => {
    expect(inferAllergens('cocoa butter')).not.toContain('dairy');
    expect(inferAllergens('apple butter')).not.toContain('dairy');
  });

  it('infers eggs from eggs', () => {
    expect(inferAllergens('free-range eggs')).toContain('eggs');
  });

  it('infers fish from named fish', () => {
    expect(inferAllergens('salmon fillets')).toContain('fish');
    expect(inferAllergens('tinned tuna')).toContain('fish');
  });

  it('infers shellfish from prawns', () => {
    expect(inferAllergens('king prawns')).toContain('shellfish');
  });

  it('infers sesame from tahini', () => {
    expect(inferAllergens('tahini')).toContain('sesame');
  });

  it('returns nothing for a name with no allergen keywords', () => {
    expect(inferAllergens('carrot')).toEqual([]);
  });

  it('returns nothing for an empty name', () => {
    expect(inferAllergens('  ')).toEqual([]);
  });

  it('does not infer nuts from butternut squash, water chestnuts or plain coconut', () => {
    expect(inferAllergens('butternut squash')).not.toContain('nuts');
    expect(inferAllergens('water chestnuts')).not.toContain('nuts');
    expect(inferAllergens('coconut')).not.toContain('nuts');
  });

  // QA fixes (2026-09-22) — additional keywords and compound-word handling.
  it('infers shellfish from oyster sauce', () => {
    expect(inferAllergens('oyster sauce')).toContain('shellfish');
  });

  it('infers soy from tamari', () => {
    expect(inferAllergens('tamari')).toContain('soy');
  });

  it('infers dairy from buttermilk (a fused compound word)', () => {
    expect(inferAllergens('buttermilk')).toContain('dairy');
  });

  it('infers fish from fishcake, fishcakes and fish fingers', () => {
    expect(inferAllergens('fishcake')).toContain('fish');
    expect(inferAllergens('fishcakes')).toContain('fish');
    expect(inferAllergens('fish fingers')).toContain('fish');
  });

  it('infers gluten from cream crackers but NOT dairy', () => {
    const result = inferAllergens('cream crackers');
    expect(result).toContain('gluten');
    expect(result).not.toContain('dairy');
  });

  it('infers gluten from biscuits, digestives and crispbread', () => {
    expect(inferAllergens('digestive biscuits')).toContain('gluten');
    expect(inferAllergens('crispbread')).toContain('gluten');
  });

  it('still infers dairy from real cream', () => {
    expect(inferAllergens('double cream')).toContain('dairy');
    expect(inferAllergens('soured cream')).toContain('dairy');
  });

  it('infers fish from worcestershire sauce', () => {
    expect(inferAllergens('worcestershire sauce')).toContain('fish');
  });

  it('infers nuts and dairy from pesto', () => {
    const result = inferAllergens('pesto');
    expect(result).toContain('nuts');
    expect(result).toContain('dairy');
  });

  it('infers gluten from stock cube(s)', () => {
    expect(inferAllergens('chicken stock cube')).toContain('gluten');
    expect(inferAllergens('vegetable stock cubes')).toContain('gluten');
  });

  it('infers no allergen from gelatine', () => {
    expect(inferAllergens('gelatine')).toEqual([]);
  });

  it('infers fish from anchovies and anchovy', () => {
    expect(inferAllergens('anchovies')).toContain('fish');
    expect(inferAllergens('anchovy fillets')).toContain('fish');
  });

  it('infers shellfish from clams, squid, lobster and scallops', () => {
    expect(inferAllergens('clams')).toContain('shellfish');
    expect(inferAllergens('squid')).toContain('shellfish');
    expect(inferAllergens('lobster')).toContain('shellfish');
    expect(inferAllergens('scallops')).toContain('shellfish');
  });

  it('infers gluten, dairy and eggs from brioche', () => {
    const result = inferAllergens('brioche buns');
    expect(result).toContain('gluten');
    expect(result).toContain('dairy');
    expect(result).toContain('eggs');
  });

  it('infers eggs from mayonnaise and mayo', () => {
    expect(inferAllergens('mayonnaise')).toContain('eggs');
    expect(inferAllergens('mayo')).toContain('eggs');
  });

  it('infers dairy and eggs from custard', () => {
    const result = inferAllergens('custard');
    expect(result).toContain('dairy');
    expect(result).toContain('eggs');
  });

  it('infers dairy from halloumi, feta, mozzarella, cheddar, ricotta, mascarpone, ghee and paneer', () => {
    expect(inferAllergens('halloumi')).toContain('dairy');
    expect(inferAllergens('feta')).toContain('dairy');
    expect(inferAllergens('mozzarella')).toContain('dairy');
    expect(inferAllergens('cheddar')).toContain('dairy');
    expect(inferAllergens('ricotta')).toContain('dairy');
    expect(inferAllergens('mascarpone')).toContain('dairy');
    expect(inferAllergens('ghee')).toContain('dairy');
    expect(inferAllergens('paneer')).toContain('dairy');
  });
});

describe('inferAisle', () => {
  it('infers meat-fish for meat and fish', () => {
    expect(inferAisle('chicken breasts')).toBe('meat-fish');
    expect(inferAisle('salmon fillets')).toBe('meat-fish');
  });

  it('infers dairy-eggs for dairy and eggs', () => {
    expect(inferAisle('cheddar cheese')).toBe('dairy-eggs');
    expect(inferAisle('free-range eggs')).toBe('dairy-eggs');
  });

  it('infers bakery for flour and bread', () => {
    expect(inferAisle('plain flour')).toBe('bakery');
    expect(inferAisle('sliced bread')).toBe('bakery');
  });

  it('infers produce for vegetables', () => {
    expect(inferAisle('onion')).toBe('produce');
    expect(inferAisle('carrots')).toBe('produce');
  });

  it('infers pantry for rice, pasta and lentils', () => {
    expect(inferAisle('basmati rice')).toBe('pantry');
    expect(inferAisle('dried spaghetti')).toBe('pantry');
    expect(inferAisle('red lentils')).toBe('pantry');
  });

  it('infers produce for tomatoes, even tinned', () => {
    expect(inferAisle('chopped tomatoes')).toBe('produce');
  });

  it('falls back to pantry for an unrecognised ingredient', () => {
    expect(inferAisle('a very unusual thing')).toBe('pantry');
  });
});
