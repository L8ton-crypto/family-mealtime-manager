export interface FamilyMember {
  id: number;
  name: string;
  age_group: string;
  likes: string[];
  dislikes: string[];
  restrictions: string[];
  allergies: string[];
}

interface MealIdea {
  name: string;
  tags: string[];
  allergens: string[];
  description: string;
}

const MEAL_DATABASE: MealIdea[] = [
  { name: 'Spaghetti Bolognese', tags: ['dinner', 'kid-friendly'], allergens: ['gluten'], description: 'Classic mince pasta with hidden veg in the sauce' },
  { name: 'Fish Fingers & Chips', tags: ['dinner', 'kid-friendly'], allergens: ['gluten', 'fish'], description: 'Oven-baked fish fingers with chunky chips and peas' },
  { name: 'Chicken Fajitas', tags: ['dinner', 'kid-friendly'], allergens: ['gluten'], description: 'Build-your-own wraps with peppers, chicken and toppings' },
  { name: 'Mac & Cheese', tags: ['dinner', 'kid-friendly', 'vegetarian'], allergens: ['gluten', 'dairy'], description: 'Creamy baked macaroni with a crunchy breadcrumb top' },
  { name: 'Pizza Night', tags: ['dinner', 'kid-friendly', 'vegetarian'], allergens: ['gluten', 'dairy'], description: 'Homemade pizza with everyone picking their own toppings' },
  { name: 'Chicken Nuggets & Veg', tags: ['dinner', 'kid-friendly'], allergens: ['gluten'], description: 'Homemade chicken nuggets with roasted veg sticks' },
  { name: 'Jacket Potatoes', tags: ['dinner', 'kid-friendly', 'vegetarian', 'gluten-free'], allergens: ['dairy'], description: 'Loaded jacket potatoes with beans, cheese or tuna' },
  { name: 'Mild Chicken Curry', tags: ['dinner', 'kid-friendly'], allergens: [], description: 'Gentle korma-style curry with rice and naan' },
  { name: 'Toad in the Hole', tags: ['dinner', 'kid-friendly'], allergens: ['gluten', 'eggs'], description: 'Sausages in crispy Yorkshire pudding batter with gravy' },
  { name: "Shepherd's Pie", tags: ['dinner', 'kid-friendly'], allergens: ['dairy'], description: 'Lamb mince with veg topped with creamy mashed potato' },
  { name: 'Stir-Fry Noodles', tags: ['dinner', 'quick'], allergens: ['gluten', 'soy'], description: 'Quick veggie and protein stir-fry with egg noodles' },
  { name: 'Salmon & New Potatoes', tags: ['dinner', 'healthy'], allergens: ['fish'], description: 'Pan-fried salmon with boiled new potatoes and greens' },
  { name: 'Chicken Caesar Salad', tags: ['dinner', 'lunch', 'healthy'], allergens: ['dairy', 'gluten', 'eggs'], description: 'Grilled chicken on romaine with parmesan and croutons' },
  { name: 'Veggie Chilli', tags: ['dinner', 'vegetarian', 'vegan', 'gluten-free'], allergens: [], description: 'Bean and lentil chilli with rice and avocado' },
  { name: 'Grilled Chicken & Rice', tags: ['dinner', 'healthy', 'gluten-free'], allergens: [], description: 'Herb-marinated chicken thighs with fluffy rice and salad' },
  { name: 'Lentil Soup', tags: ['lunch', 'dinner', 'vegan', 'gluten-free'], allergens: [], description: 'Hearty red lentil soup with crusty bread' },
  { name: 'Bean Burritos', tags: ['dinner', 'vegetarian'], allergens: ['gluten', 'dairy'], description: 'Spiced black beans with rice, salsa and cheese in wraps' },
  { name: 'Mediterranean Couscous', tags: ['lunch', 'dinner', 'vegetarian'], allergens: ['gluten'], description: 'Fluffy couscous with roasted veg, feta and olives' },
  { name: 'Porridge with Fruit', tags: ['breakfast', 'vegetarian', 'healthy'], allergens: ['dairy'], description: 'Warm oat porridge with banana, berries and honey' },
  { name: 'Scrambled Eggs on Toast', tags: ['breakfast', 'vegetarian', 'quick'], allergens: ['eggs', 'gluten', 'dairy'], description: 'Fluffy scrambled eggs on buttery toast' },
  { name: 'Pancakes', tags: ['breakfast', 'kid-friendly', 'vegetarian'], allergens: ['eggs', 'gluten', 'dairy'], description: 'Fluffy pancakes with maple syrup and fresh berries' },
  { name: 'Smoothie Bowls', tags: ['breakfast', 'vegan', 'gluten-free', 'healthy'], allergens: [], description: 'Blended fruit bowls with granola and seed toppings' },
  { name: 'Full English', tags: ['breakfast'], allergens: ['gluten', 'eggs'], description: 'Bacon, eggs, sausage, beans, toast and tomatoes' },
  { name: 'Tomato Soup & Grilled Cheese', tags: ['lunch', 'vegetarian', 'kid-friendly'], allergens: ['dairy', 'gluten'], description: 'Classic comfort combo - creamy soup with melty sandwiches' },
  { name: 'Wraps & Hummus', tags: ['lunch', 'vegan', 'kid-friendly'], allergens: ['gluten', 'sesame'], description: 'Veggie wraps with homemade hummus and crudites' },
  { name: 'Tuna Pasta Salad', tags: ['lunch'], allergens: ['fish', 'gluten'], description: 'Cold pasta salad with tuna, sweetcorn and mayo' },
  { name: 'Quesadillas', tags: ['lunch', 'kid-friendly', 'vegetarian', 'quick'], allergens: ['gluten', 'dairy'], description: 'Cheese and bean quesadillas with dipping salsa' },
  { name: 'Sunday Roast Chicken', tags: ['dinner', 'sunday'], allergens: ['gluten'], description: 'Roast chicken with all the trimmings and gravy' },
  { name: 'Slow Cooker Beef Stew', tags: ['dinner', 'slow-cook'], allergens: [], description: 'Tender beef with root veg in rich gravy, set and forget' },
  { name: 'Homemade Burgers', tags: ['dinner', 'kid-friendly', 'bbq'], allergens: ['gluten', 'dairy', 'eggs'], description: 'Seasoned beef burgers with all the fixings' },
  { name: 'Fish Pie', tags: ['dinner'], allergens: ['fish', 'dairy', 'gluten'], description: 'Creamy fish pie with mash topping and mixed seafood' },
  { name: 'Pasta Bake', tags: ['dinner', 'kid-friendly', 'vegetarian'], allergens: ['gluten', 'dairy'], description: 'Cheesy pasta bake with tomato sauce and hidden veg' },
];

export function getSuggestions(members: FamilyMember[], mealType?: string): { name: string; description: string; score: number; warnings: string[] }[] {
  if (members.length === 0) return [];
  const allAllergens = new Set<string>();
  const allRestrictions = new Set<string>();
  const allDislikes = new Set<string>();
  const allLikes: string[] = [];
  for (const m of members) {
    m.allergies.forEach(a => allAllergens.add(a.toLowerCase()));
    m.restrictions.forEach(r => allRestrictions.add(r.toLowerCase()));
    m.dislikes.forEach(d => allDislikes.add(d.toLowerCase()));
    m.likes.forEach(l => allLikes.push(l.toLowerCase()));
  }
  return MEAL_DATABASE
    .filter(meal => {
      for (const allergen of meal.allergens) { if (allAllergens.has(allergen.toLowerCase())) return false; }
      if (allRestrictions.has('vegetarian') && !meal.tags.includes('vegetarian') && !meal.tags.includes('vegan')) return false;
      if (allRestrictions.has('vegan') && !meal.tags.includes('vegan')) return false;
      if (allRestrictions.has('gluten-free') && meal.allergens.includes('gluten')) return false;
      if (allRestrictions.has('dairy-free') && meal.allergens.includes('dairy')) return false;
      if (mealType && !meal.tags.includes(mealType)) return false;
      return true;
    })
    .map(meal => {
      let score = 50;
      const warnings: string[] = [];
      for (const like of allLikes) {
        if (meal.name.toLowerCase().includes(like) || meal.description.toLowerCase().includes(like)) score += 15;
      }
      for (const dislike of allDislikes) {
        if (meal.name.toLowerCase().includes(dislike) || meal.description.toLowerCase().includes(dislike)) {
          score -= 20;
          const who = members.filter(m => m.dislikes.some(d => d.toLowerCase() === dislike)).map(m => m.name);
          warnings.push(`${who.join(', ')} ${who.length > 1 ? 'dislike' : 'dislikes'} ${dislike}`);
        }
      }
      const hasKids = members.some(m => ['baby', 'toddler', 'child'].includes(m.age_group));
      if (hasKids && meal.tags.includes('kid-friendly')) score += 10;
      return { name: meal.name, description: meal.description, score, warnings };
    })
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score);
}

