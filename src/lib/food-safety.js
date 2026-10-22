/**
 * food-safety.js — allergies, diet and dislikes for suggestions (fork).
 *
 * Pure, no I/O. Decides whether a food may be SUGGESTED to this person.
 *
 * Read this limit first: the app stores no ingredient lists or allergen tags, so
 * this matches the food's NAME, brand, notes and categories against word lists
 * (and, for AI suggestions, the allergens the AI itself reports). It is a safety
 * net against obvious cases, not a guarantee. It cannot see a sauce, a
 * "natural flavour" or cross-contact. The UI says so wherever it is switched on.
 * It errs towards blocking (bread, pancakes and oats count as gluten; pancakes
 * as egg), and it never says anything is "free of" an allergen.
 */

/** The nine major allergens (US) as tick boxes. */
export const ALLERGENS = [
  { id: 'milk',      label: 'Milk (dairy)' },
  { id: 'egg',       label: 'Egg' },
  { id: 'peanut',    label: 'Peanut' },
  { id: 'tree-nut',  label: 'Tree nuts' },
  { id: 'soy',       label: 'Soy' },
  { id: 'wheat',     label: 'Wheat / gluten' },
  { id: 'fish',      label: 'Fish' },
  { id: 'shellfish', label: 'Shellfish' },
  { id: 'sesame',    label: 'Sesame' },
];

export const DIETS = [
  { id: 'none',        label: 'No restriction' },
  { id: 'pescatarian', label: 'Pescatarian (no meat)' },
  { id: 'vegetarian',  label: 'Vegetarian (no meat or fish)' },
  { id: 'vegan',       label: 'Vegan (no animal products)' },
];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const PLANT_DAIRY = /\b(almond|soy|soya|oat|coconut|rice|cashew|hemp|pea|macadamia|plant|nut|oat) (milk|yogurt|yoghurt|cheese|cream|creamer)\b/g;
const NUT_BUTTER = /\b(peanut|almond|cashew|nut|sunflower|seed|cocoa|cacao|shea|apple|sesame|soy) butter\b/g;
// "dairy free", "non dairy", "no dairy": an item that says so in its own name is not flagged for that allergen.
const freeRe = (word) => new RegExp(`\\b${word} free\\b|\\bnon ${word}\\b|\\bno ${word}\\b`);

/** id → { re: what to look for, except: phrases to ignore first, exempt: label claims that clear the item } */
const RULES = {
  milk: {
    re: /\b(milks?|cheeses?|cheddar|mozzarella|parmesan|parmigiano|ricotta|feta|gouda|brie|provolone|yogurts?|yoghurts?|skyr|kefir|butter|buttermilk|cream|creamer|half and half|whey|casein|ghee|custard|ice cream|gelato|latte|cappuccino|milkshakes?|paneer|queso|alfredo|mac and cheese|macaroni and cheese)\b/,
    except: [PLANT_DAIRY, NUT_BUTTER, /\bcream of tartar\b/g, /\bcoconut (milk|cream)\b/g],
    exempt: [freeRe('dairy'), freeRe('milk'), /\bvegan\b/],
  },
  egg: {
    re: /\b(eggs?|omelet|omelette|frittata|quiche|mayonnaise|mayo|aioli|meringue|custard|hollandaise|brioche|challah|eggnog|pancakes?|waffles?|french toast)\b/,
    except: [/\beggplants?\b/g],
    exempt: [freeRe('egg'), /\bvegan\b/],
  },
  peanut: { re: /\b(peanuts?|groundnuts?|satay|pad thai)\b/, except: [], exempt: [freeRe('peanut')] },
  'tree-nut': {
    re: /\b(almonds?|walnuts?|cashews?|pecans?|pistachios?|hazelnuts?|filberts?|macadamias?|brazil nuts?|pine nuts?|pinon|chestnuts?|praline|marzipan|nutella|gianduja|nut butter|mixed nuts?|trail mix|nuts?)\b/,
    except: [], exempt: [freeRe('nut'), freeRe('tree nut')],
  },
  soy: { re: /\b(soy|soya|soybeans?|tofu|edamame|tempeh|miso|tamari|shoyu|natto|teriyaki)\b/, except: [], exempt: [freeRe('soy')] },
  wheat: {
    re: /\b(wheat|flour|breads?|bagels?|pasta|noodles?|spaghetti|macaroni|penne|linguine|fettuccine|lasagna|ravioli|couscous|bulgur|farro|spelt|semolina|seitan|barley|rye|oats?|oatmeal|granola|cereal|crackers?|pretzels?|tortillas?|pita|naan|pizza|pancakes?|waffles?|cookies?|cakes?|muffins?|donuts?|doughnuts?|croissants?|biscuits?|pie|sandwich|sandwiches|burgers?|hamburgers?|cheeseburgers?|hot dogs?|buns?|wraps?|breaded|breading|battered|tempura|dumplings?|gyoza|ramen|udon|beer|malt|panko|croutons?|toast|burritos?|nuggets?)\b/,
    except: [/\bcorn tortillas?\b/g, /\brice (noodles?|cakes?|flour|pasta)\b/g, /\b(corn|almond|coconut|tapioca|chickpea) flour\b/g, /\bveggie burgers?\b/g],
    exempt: [/\bgluten free\b/, freeRe('wheat'), freeRe('gluten')],
  },
  fish: {
    re: /\b(fish|salmon|tuna|cod|tilapia|trout|halibut|anchovy|anchovies|sardines?|mackerel|haddock|bass|snapper|catfish|pollock|mahi|swordfish|herring|flounder|worcestershire|caesar)\b/,
    except: [/\bgoldfish\b/g, /\bswedish fish\b/g], exempt: [freeRe('fish')],
  },
  shellfish: {
    re: /\b(shrimps?|prawns?|crabs?|lobsters?|crawfish|crayfish|scallops?|clams?|mussels?|oysters?|squid|calamari|octopus|abalone|krill|surimi|langoustines?)\b/,
    except: [], exempt: [freeRe('shellfish')],
  },
  sesame: { re: /\b(sesame|tahini|hummus|halva|halvah|benne|gomashio)\b/, except: [], exempt: [freeRe('sesame')] },
};

const MEAT = /\b(beef|steaks?|sirloin|ribeye|brisket|burgers?|hamburgers?|cheeseburgers?|hot dogs?|chicken|wings|drumsticks?|nuggets?|turkey|pork|bacon|ham|sausages?|salami|pepperoni|prosciutto|chorizo|lamb|veal|duck|goose|venison|bison|meatballs?|meatloaf|jerky|lard|ribs|gelatin)\b/;
const MEAT_EXCEPT = [/\b(veggie|vegetarian|vegan|plant based|meatless|beyond|impossible|tofu|bean|black bean) (burgers?|nuggets?|sausages?|hot dogs?|meatballs?|bacon|jerky)\b/g, /\bmeatless\b/g, /\bplant based\b/g];
const FISHY = /\b(fish|salmon|tuna|cod|tilapia|trout|halibut|anchovy|anchovies|sardines?|mackerel|haddock|snapper|catfish|pollock|swordfish|herring|shrimps?|prawns?|crabs?|lobsters?|scallops?|clams?|mussels?|oysters?|squid|calamari|octopus|surimi)\b/;
const VEGAN_ONLY = /\b(honey|beeswax|whey|casein|gelatin)\b/;

/** Everything about a food that could name an ingredient, lower-cased and cleaned. */
export function foodText(food) {
  if (!food) return '';
  const cats = Array.isArray(food.categories) ? food.categories.join(' ') : '';
  return norm([food.brand === 'USDA' ? '' : food.brand, food.name, food.origName, food.notes, food.ingredients, food.ingredients_text, cats].filter(Boolean).join(' '));
}

function hit(id, text) {
  const rule = RULES[id];
  if (!rule) return false;
  if ((rule.exempt || []).some(re => re.test(text))) return false;
  let t = ` ${text} `;
  for (const ex of rule.except || []) t = t.replace(ex, ' ');
  return rule.re.test(t);
}

/** Which of the chosen allergens a food's text mentions. */
export function allergenHits(food, allergens = []) {
  const text = foodText(food);
  if (!text) return [];
  return (allergens || []).filter(a => hit(a, text));
}

/** The diet rule a food breaks, or null. */
export function dietViolation(food, diet = 'none') {
  if (!diet || diet === 'none') return null;
  const text = foodText(food);
  if (!text) return null;
  let t = ` ${text} `;
  for (const ex of MEAT_EXCEPT) t = t.replace(ex, ' ');
  if (MEAT.test(t)) return diet === 'pescatarian' || diet === 'vegetarian' || diet === 'vegan' ? 'meat' : null;
  if ((diet === 'vegetarian' || diet === 'vegan') && FISHY.test(t)) return 'fish';
  if (diet === 'vegan') {
    if (hit('milk', text)) return 'dairy';
    if (hit('egg', text)) return 'egg';
    if (VEGAN_ONLY.test(t)) return 'animal product';
  }
  return null;
}

/** Free-text terms ("mushrooms", "mustard") matched as words inside the food's text. */
export function termHits(food, terms = []) {
  const text = ` ${foodText(food)} `;
  if (!text.trim()) return [];
  return (terms || []).filter(term => {
    const k = norm(term);
    return k.length >= 3 && (text.includes(` ${k} `) || text.includes(` ${k}s `) || text.includes(` ${k}es `) || text.includes(k));
  });
}

export const EMPTY_PREFS = Object.freeze({ allergens: [], avoid: [], diet: 'none', dislikes: [] });

export function normalizePrefs(p) {
  return {
    allergens: Array.isArray(p?.allergens) ? p.allergens.filter(a => RULES[a]) : [],
    avoid: Array.isArray(p?.avoid) ? p.avoid.map(x => String(x).trim()).filter(Boolean) : [],
    diet: DIETS.some(d => d.id === p?.diet) ? p.diet : 'none',
    dislikes: Array.isArray(p?.dislikes) ? p.dislikes.map(x => String(x).trim()).filter(Boolean) : [],
  };
}

export const hasPrefs = (p) => { const n = normalizePrefs(p); return !!(n.allergens.length || n.avoid.length || n.dislikes.length || n.diet !== 'none'); };

/**
 * May this food be suggested? Hard rules (allergen, "other things to avoid", diet) and the soft one
 * (dislike) are both enough to keep it out; the reasons say which.
 * @returns {{ok:boolean, reasons:string[]}}
 */
export function checkFood(food, prefs) {
  const p = normalizePrefs(prefs);
  const reasons = [];
  for (const a of allergenHits(food, p.allergens)) reasons.push(`allergen:${a}`);
  for (const t of termHits(food, p.avoid)) reasons.push(`avoid:${t}`);
  const d = dietViolation(food, p.diet);
  if (d) reasons.push(`diet:${p.diet}:${d}`);
  for (const t of termHits(food, p.dislikes)) reasons.push(`dislike:${t}`);
  return { ok: reasons.length === 0, reasons };
}
export const isAllowed = (food, prefs) => checkFood(food, prefs).ok;

/* ── AI answers: allergens the model says an item contains ───────────────── */

const SYNONYMS = {
  dairy: 'milk', milk: 'milk', lactose: 'milk', eggs: 'egg', egg: 'egg', peanut: 'peanut', peanuts: 'peanut',
  'tree nut': 'tree-nut', 'tree nuts': 'tree-nut', 'tree-nut': 'tree-nut', nuts: 'tree-nut', nut: 'tree-nut',
  soy: 'soy', soya: 'soy', soybeans: 'soy', wheat: 'wheat', gluten: 'wheat', fish: 'fish',
  shellfish: 'shellfish', crustaceans: 'shellfish', crustacean: 'shellfish', sesame: 'sesame',
};
/** Allergen ids a model-supplied "contains" list maps to. */
export function declaredAllergens(contains) {
  if (!Array.isArray(contains)) return null;                       // null = the model did not say
  return [...new Set(contains.map(c => SYNONYMS[norm(c)]).filter(Boolean))];
}

/** Lines to add to an AI prompt. Empty when there is nothing to say. */
export function prefsPromptLines(prefs) {
  const p = normalizePrefs(prefs);
  const lines = [];
  const names = p.allergens.map(a => ALLERGENS.find(x => x.id === a)?.label || a);
  if (names.length || p.avoid.length) lines.push(`ALLERGIES / MUST AVOID (never suggest anything that contains these, in any form): ${[...names, ...p.avoid].join(', ')}`);
  if (p.diet !== 'none') lines.push(`Diet: ${DIETS.find(d => d.id === p.diet).label}`);
  if (p.dislikes.length) lines.push(`Dislikes (do not suggest): ${p.dislikes.slice(0, 40).join(', ')}`);
  return lines;
}

/**
 * Is an AI suggestion acceptable? Checks the name against the word lists AND the
 * allergens the model reported. Also says whether the model reported at all,
 * so the UI can show "allergens not confirmed" instead of implying it is safe.
 * @returns {{ok:boolean, reasons:string[], confirmed:boolean}}
 */
export function checkAiItem(food, contains, prefs) {
  const p = normalizePrefs(prefs);
  const base = checkFood(food, p);
  const reasons = [...base.reasons];
  const declared = declaredAllergens(contains);
  for (const a of declared || []) if (p.allergens.includes(a) && !reasons.includes(`allergen:${a}`)) reasons.push(`allergen:${a}`);
  return { ok: reasons.length === 0, reasons, confirmed: declared !== null };
}

export const REASON_TEXT = (r) => {
  const [kind, a, b] = String(r).split(':');
  if (kind === 'allergen') return `contains ${ALLERGENS.find(x => x.id === a)?.label || a}`;
  if (kind === 'avoid') return `avoids ${a}`;
  if (kind === 'diet') return `${a}${b ? ` (${b})` : ''}`;
  return `dislike ${a}`;
};

export const SAFETY_NOTE = 'Filtering uses food names and what the AI reports, not full ingredient lists. It can miss hidden ingredients and cross-contact. Always read the label or ask the restaurant. This is not medical advice.';
