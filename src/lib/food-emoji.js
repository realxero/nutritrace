/**
 * food-emoji.js — picks the emoji shown for a food (fork addition).
 *
 * Resolution order, first hit wins:
 *   1. a choice the user made for this food (remembered by name + brand)
 *   2. the item's own `emoji` (set when it was logged, from its categories)
 *   3. a known brand (Skittles → 🍬, Doritos → 🥔 …)
 *   4. the product's Open Food Facts / USDA category (Candies, Chips, Sodas …)
 *   5. group words in the name (bowl, crackers, granola …) and the existing
 *      dish/ingredient rules in common-foods.js
 *
 * 4 covers branded items nobody listed; 3 and 5 cover foods typed in by hand
 * or proposed by the AI, which carry no categories.
 */
import { foodEmoji as _nameEmoji } from './common-foods.js';

const _norm = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\s+/g, ' ').trim();

/* ── Remembered choices ─────────────────────────────────────────────── */
// { "<name>|<brand>": { name?: 'Renamed', emoji?: '🥣' } }, keyed by the
// food's ORIGINAL name so a rename never loses its own memory.
export function overrideKey(name, brand) {
  return `${_norm(name)}|${_norm(brand)}`;
}

let _overrides = {};
/** Settings store feeds the saved map in here (see stores/settings.js). */
export function setFoodOverrides(map) {
  _overrides = map && typeof map === 'object' ? map : {};
}
export function getOverride(name, brand) {
  return _overrides[overrideKey(name, brand)] || _overrides[overrideKey(name, '')] || null;
}

/* ── Brands ─────────────────────────────────────────────────────────── */
// Matched as whole words anywhere in "name + brand". Longer keys win.
const BRANDS = {
  // candy
  'skittles': '🍬', 'starburst': '🍬', 'haribo': '🍬', 'sour patch': '🍬', 'jolly rancher': '🍬',
  'twizzlers': '🍬', 'swedish fish': '🍬', 'life savers': '🍬', 'tic tac': '🍬', 'airheads': '🍬',
  'snickers': '🍫', 'twix': '🍫', 'milky way': '🍫', 'kit kat': '🍫', 'kitkat': '🍫',
  'hershey': '🍫', 'reese': '🍫', 'm and m': '🍫', 'mms': '🍫', 'toblerone': '🍫', 'cadbury': '🍫',
  'lindt': '🍫', 'ferrero': '🍫', 'kinder': '🍫', 'nutella': '🍫', 'oreo': '🍪', 'chips ahoy': '🍪',
  'nutter butter': '🍪', 'biscoff': '🍪', 'pop tarts': '🥐',
  // chips / salty snacks
  'doritos': '🥔', 'lays': '🥔', 'pringles': '🥔', 'ruffles': '🥔', 'cheetos': '🥔', 'fritos': '🥔',
  'tostitos': '🥔', 'takis': '🥔', 'funyuns': '🥔', 'kettle chips': '🥔', 'cape cod': '🥔', 'sun chips': '🥔', 'popchips': '🥔', 'pirate booty': '🍿', 'smartfood': '🍿',
  'cheez it': '🧀', 'cheez its': '🧀', 'goldfish': '🧀', 'ritz': '🧀', 'triscuit': '🧀', 'wheat thins': '🧀',
  'club crackers': '🧀', 'town house': '🧀', 'nabisco': '🍪', 'pepperidge farm': '🍪',
  'planters': '🥜', 'blue diamond': '🥜', 'wonderful pistachios': '🥜',
  // bars / cereal
  'clif bar': '🍫', 'kind bar': '🍫', 'quest bar': '🍫', 'rxbar': '🍫', 'larabar': '🍫', 'nature valley': '🍫',
  'cheerios': '🥣', 'frosted flakes': '🥣', 'froot loops': '🥣', 'lucky charms': '🥣', 'cap n crunch': '🥣',
  'special k': '🥣', 'kellogg': '🥣', 'quaker': '🥣', 'honey bunches': '🥣', 'raisin bran': '🥣', 'chex': '🥣',
  // drinks
  'coca cola': '🥤', 'coke': '🥤', 'pepsi': '🥤', 'sprite': '🥤', 'fanta': '🥤', 'dr pepper': '🥤',
  'mountain dew': '🥤', 'mtn dew': '🥤', '7up': '🥤', 'seven up': '🥤', 'root beer': '🥤', 'gatorade': '🥤',
  'powerade': '🥤', 'red bull': '🥤', 'monster energy': '🥤', 'celsius energy': '🥤', 'bang energy': '🥤', 'vitaminwater': '🥤', 'snapple': '🥤', 'arizona iced tea': '🥤', 'lipton': '🍵', 'nestea': '🍵', 'pure leaf': '🍵',
  'tropicana': '🧃', 'minute maid': '🧃', 'capri sun': '🧃', 'ocean spray': '🧃', 'v8': '🧃',
  'starbucks': '☕', 'dunkin': '☕', 'nescafe': '☕', 'folgers': '☕', 'nespresso': '☕',
  'fiji': '💧', 'dasani': '💧', 'aquafina': '💧', 'evian': '💧', 'perrier': '💧', 'lacroix': '💧',
  'guinness': '🍺', 'heineken': '🍺', 'budweiser': '🍺', 'corona beer': '🍺', 'bud light': '🍺', 'coors': '🍺',
  'oatly': '🥛', 'silk almond': '🥛', 'fairlife': '🥛', 'chobani': '🥣', 'fage': '🥣', 'oikos': '🥣', 'yoplait': '🥣',
  'danone': '🥣', 'activia': '🥣', 'muller': '🥣', 'ben and jerrys': '🍨', 'haagen dazs': '🍨', 'magnum': '🍨',
  'halo top': '🍨', 'drumstick': '🍨', 'klondike': '🍨',
  // fast food / frozen
  'mcdonalds': '🍔', 'big mac': '🍔', 'whopper': '🍔', 'burger king': '🍔', 'wendys': '🍔', 'in n out': '🍔',
  'five guys': '🍔', 'kfc': '🍗', 'popeyes': '🍗', 'chick fil a': '🍗', 'chipotle': '🌯', 'taco bell': '🌮',
  'subway': '🥪', 'jimmy johns': '🥪', 'jersey mikes': '🥪', 'panera': '🥪', 'dominos': '🍕', 'pizza hut': '🍕',
  'papa johns': '🍕', 'little caesars': '🍕', 'digiorno': '🍕', 'totinos': '🍕', 'hot pockets': '🥟',
  'lean cuisine': '🍽️', 'stouffers': '🍝', 'amys': '🍲', 'campbells': '🍲', 'maruchan': '🍜', 'nissin': '🍜',
  'kraft': '🧀', 'velveeta': '🧀', 'babybel': '🧀', 'laughing cow': '🧀', 'philadelphia': '🧀',
  'spam': '🥩', 'oscar mayer': '🥓', 'hormel': '🥩', 'jack links': '🥩', 'slim jim': '🥩',
  'eggo': '🧇', 'aunt jemima': '🥞', 'pillsbury': '🥐', 'entenmanns': '🍰', 'little debbie': '🍰',
  'hostess': '🍰', 'twinkies': '🍰', 'sara lee': '🍞', 'wonder bread': '🍞', 'dave s killer': '🍞', 'daves killer': '🍞',
};

/* ── Group words ────────────────────────────────────────────────────── */
// The words the dish rules in common-foods.js don't carry. Matched as
// whole words (after plural stemming) anywhere in the name.
const GROUP_WORDS = {
  'bowl': '🥣', 'poke': '🥣', 'acai': '🥣', 'crackers': '🧀', 'cracker': '🧀', 'granola': '🥣',
  'muesli': '🥣', 'porridge': '🥣', 'grits': '🥣', 'trail mix': '🥜', 'almond': '🥜', 'cashew': '🥜',
  'pistachio': '🥜', 'walnut': '🥜', 'peanut butter': '🥜', 'hummus': '🥣', 'guacamole': '🥑',
  'salsa': '🍅', 'dip': '🥣', 'gum': '🍬', 'mint': '🍬', 'lollipop': '🍭', 'marshmallow': '🍬',
  'licorice': '🍬', 'caramel': '🍬', 'toffee': '🍬', 'fudge': '🍫', 'truffle': '🍫', 'wafer': '🍪',
  'biscuit': '🍪', 'scone': '🥐', 'danish': '🥐', 'strudel': '🥧', 'tart': '🥧', 'pudding': '🍮',
  'custard': '🍮', 'flan': '🍮', 'jello': '🍮', 'gelato': '🍨', 'sorbet': '🍨', 'popsicle': '🍦',
  'sundae': '🍨', 'frosting': '🍰', 'sprinkles': '🍰', 'jam': '🍓', 'jelly': '🍓', 'syrup': '🍯',
  'honey': '🍯', 'butter': '🧈', 'ghee': '🧈', 'margarine': '🧈', 'mayo': '🥫', 'mayonnaise': '🥫',
  'ketchup': '🥫', 'mustard': '🥫', 'sauce': '🥫', 'dressing': '🥗', 'vinaigrette': '🥗', 'broth': '🍲',
  'bouillon': '🍲', 'stock': '🍲', 'tortilla': '🌯', 'pita': '🥙', 'naan': '🫓', 'flatbread': '🫓',
  'bun': '🍞', 'roll': '🍞', 'baguette': '🥖', 'sourdough': '🍞', 'cornbread': '🍞', 'stuffing': '🍞',
  'rice cake': '🍘', 'rice cracker': '🍘', 'seaweed': '🍙', 'onigiri': '🍙', 'kimbap': '🍙', 'bento': '🍱',
  'kebab': '🍢', 'skewer': '🍢', 'meatball': '🍝', 'meatloaf': '🍖', 'ribs': '🍖', 'brisket': '🍖',
  'ham': '🍖', 'deli': '🥪', 'tenders': '🍗', 'drumstick': '🍗', 'wing': '🍗', 'nugget': '🍗',
  'scramble': '🍳', 'frittata': '🍳', 'quiche': '🥧', 'casserole': '🍲', 'hash': '🍳', 'paella': '🥘',
  'risotto': '🍚', 'pilaf': '🍚', 'congee': '🍚', 'mac and cheese': '🧀', 'macaroni': '🍝',
  'protein powder': '🥤', 'whey': '🥤', 'creatine': '🥤', 'electrolyte': '🥤', 'energy drink': '🥤',
  'sparkling': '🥤', 'tonic': '🥤', 'seltzer': '💧', 'cider': '🍎', 'applesauce': '🍎', 'kimchi': '🥬',
  'sauerkraut': '🥬', 'pickle': '🥒', 'olive': '🫒', 'edamame': '🫛', 'beans': '🫘', 'lentil': '🫘',
  'chickpea': '🫘', 'tempeh': '🫘', 'seitan': '🌱', 'falafel': '🧆', 'hot sauce': '🌶️',
};

/* ── Categories (Open Food Facts + USDA branded) ────────────────────── */
// Substring match against the category tag/name ("en:candies" → "candies").
// First row that matches wins, so specific rows sit above general ones.
const CATEGORY_RULES = [
  [/chocolate|cocoa|candy bar/, '🍫'],
  [/candies|candy|confection|gummies|gummy|lollipop|marshmallow|licorice|sweets/, '🍬'],
  [/ice[- ]cream|frozen dessert|sorbet|gelato/, '🍨'],
  [/biscuit|cookie|wafer/, '🍪'],
  [/cake|pastr|viennoiserie|croissant|muffin|brownie|dessert/, '🍰'],
  [/crisps|chips|potato snack|salty snack|pretzel|tortilla chip|corn snack/, '🥔'],
  [/popcorn/, '🍿'],
  [/cracker|crispbread|appetizer/, '🧀'],
  [/nuts|peanut|almond|seeds|trail mix|dried fruit/, '🥜'],
  [/energy bar|protein bar|cereal bar|snack bar|granola bar/, '🍫'],
  [/breakfast cereal|cereals|granola|muesli|oat/, '🥣'],
  [/soda|carbonated|cola|soft drink|sodas|energy drink|sports drink|sweetened beverage/, '🥤'],
  [/fruit juice|juices|nectar|vegetable juice/, '🧃'],
  [/coffee|espresso|latte/, '☕'],
  [/tea|infusion|matcha/, '🍵'],
  [/water/, '💧'],
  [/beer/, '🍺'],
  [/wine|champagne/, '🍷'],
  [/spirit|liquor|whisk|vodka|rum|gin\b|cocktail/, '🍸'],
  [/plant[- ]based milk|milks|dairy drink|\bmilk\b/, '🥛'],
  [/yogurt|yoghurt|skyr|fermented milk|dairy dessert/, '🥣'],
  [/cheese/, '🧀'],
  [/butter|margarine|fats/, '🧈'],
  [/egg/, '🥚'],
  [/pizza|quiche|pie\b/, '🍕'],
  [/burger|hamburger/, '🍔'],
  [/sandwich|wrap|panini|toast/, '🥪'],
  [/sushi|sashimi/, '🍣'],
  [/noodle|ramen|instant noodle/, '🍜'],
  [/pasta|spaghetti|macaroni|lasagna|ravioli/, '🍝'],
  [/rice\b/, '🍚'],
  [/soup|broth|stew/, '🍲'],
  [/salad|dressing/, '🥗'],
  [/sauce|condiment|ketchup|mustard|mayonnaise|dips?\b/, '🥫'],
  [/jam|spread|honey|syrup/, '🍯'],
  [/bread|bakery|bagel|bun\b/, '🍞'],
  [/pancake|waffle|crepe/, '🥞'],
  [/sausage|charcuterie|ham\b|bacon|cured meat|deli meat|jerky/, '🥓'],
  [/poultry|chicken|turkey/, '🍗'],
  [/beef|pork|lamb|meat|steak/, '🥩'],
  [/fish|seafood|tuna|salmon|shrimp/, '🐟'],
  [/fruit|berries|apple|banana|citrus/, '🍎'],
  [/vegetable|legume|beans|lentil|tomato/, '🥦'],
  [/frozen meal|ready meal|prepared meal|convenience/, '🍽️'],
];

/** Emoji for one category tag or a list of them ("en:Candies", ["en:snacks", "en:chips"]). */
export function emojiFromCategories(categories) {
  const list = Array.isArray(categories) ? categories : (categories ? String(categories).split(/[,;|>]/) : []);
  // Most specific tags come last in OFF's hierarchy, so scan from the end.
  for (let i = list.length - 1; i >= 0; i--) {
    const c = String(list[i] || '').toLowerCase().replace(/^[a-z]{2}:/, '').replace(/-/g, ' ').trim();
    if (!c) continue;
    for (const [re, e] of CATEGORY_RULES) if (re.test(c)) return e;
  }
  return '';
}

/* ── Name-based lookups ─────────────────────────────────────────────── */
const _stem = (w) => w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y'
  : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
const _stemmed = (s) => _norm(s).split(' ').filter(Boolean).map(_stem).join(' ');

function _buildMatcher(map) {
  return Object.entries(map)
    .map(([k, v]) => [` ${_stemmed(k)} `, v])
    .sort((a, b) => b[0].length - a[0].length);
}
const _brandKeys = _buildMatcher(BRANDS);
const _groupKeys = _buildMatcher(GROUP_WORDS);

function _scan(keys, text) {
  const t = ` ${_stemmed(text)} `;
  for (const [k, v] of keys) if (t.includes(k)) return v;
  return '';
}

export const brandEmoji = (name, brand) => _scan(_brandKeys, `${brand || ''} ${name || ''}`);
export const groupWordEmoji = (name) => _scan(_groupKeys, name);

/** Emoji to store on an item at log time: category- or brand-derived only
 *  (never a name guess, so the live name rules can still improve later). */
export function emojiAtLogTime(food) {
  if (!food) return '';
  return brandEmoji(food.name, food.brand) || emojiFromCategories(food.offCategories || food.categories_tags) || '';
}

/**
 * The emoji to show. `item` is anything food-shaped: a diary item, a saved
 * food, a search hit. `originalName` is what the food was called before a
 * rename, so a remembered choice still finds it.
 */
export function resolveFoodEmoji(item) {
  if (!item) return '';
  const orig = item.origName || item.name;
  const ov = getOverride(orig, item.brand);
  if (ov?.emoji) return ov.emoji;
  if (item.emoji) return item.emoji;
  if (item.icon) return item.icon;
  const b = brandEmoji(item.name, item.brand);
  if (b) return b;
  const c = emojiFromCategories(item.offCategories || item.categories_tags);
  if (c) return c;
  // Dish and ingredient rules first (they know "pizza" beats "pineapple"),
  // then the extra group words.
  return _nameEmoji(item.name, '') || groupWordEmoji(item.name) || '';
}

/** Name to show for a food: a remembered rename wins. */
export function resolveFoodName(name, brand) {
  return getOverride(name, brand)?.name || name;
}

/** A compact set to offer when the user changes an emoji. */
export const EMOJI_CHOICES = [
  '🍎','🍌','🍇','🍓','🫐','🥑','🥦','🥕','🌽','🥔','🍅','🥬',
  '🍞','🥐','🥯','🥞','🧇','🥚','🍳','🧀','🥛','🥣','🍚','🍝',
  '🍜','🍲','🍛','🍣','🥟','🌮','🌯','🥪','🍔','🍕','🌭','🍟',
  '🍗','🥩','🥓','🐟','🍤','🥜','🍿','🥨','🍪','🍩','🍰','🍫',
  '🍬','🍨','🍯','🥫','☕','🍵','🧃','🥤','🧋','💧','🍺','🍷',
  '🍽️','🥗','🧆','🫘','🍙','🍱','🥘','🧁',
];
