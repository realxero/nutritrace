#!/usr/bin/env python3
"""
Rebuild src/lib/common-foods-data.js from USDA SR28 (public domain).

Get the SR28 ASCII files (FOOD_DES, NUT_DATA, WEIGHT) from USDA ARS or
github.com/alyssaq/usda-sqlite (data/), then:
  python3 scripts/build-common-foods.py /path/to/sr28/data
Edit C (the food list) or DEFAULTS (default portion per food) below.
"""
import json, re, sys, os

# (friendly name, emoji, category, exact SR28 Long_Desc, [aliases])
C = [
 # Fruits
 ("Apple","🍎","Fruits","Apples, raw, with skin",["apples"]),
 ("Banana","🍌","Fruits","Bananas, raw",["bananas"]),
 ("Orange","🍊","Fruits","Oranges, raw, all commercial varieties",["oranges"]),
 ("Strawberries","🍓","Fruits","Strawberries, raw",["strawberry"]),
 ("Blueberries","🫐","Fruits","Blueberries, raw",["blueberry"]),
 ("Raspberries","🍇","Fruits","Raspberries, raw",["raspberry"]),
 ("Blackberries","🍇","Fruits","Blackberries, raw",["blackberry"]),
 ("Grapes","🍇","Fruits","Grapes, red or green (European type, such as Thompson seedless), raw",["grape"]),
 ("Watermelon","🍉","Fruits","Watermelon, raw",[]),
 ("Cantaloupe","🍈","Fruits","Melons, cantaloupe, raw",["melon"]),
 ("Honeydew","🍈","Fruits","Melons, honeydew, raw",[]),
 ("Pineapple","🍍","Fruits","Pineapple, raw, all varieties",[]),
 ("Mango","🥭","Fruits","Mangos, raw",["mangos","mangoes"]),
 ("Peach","🍑","Fruits","Peaches, yellow, raw",["peaches"]),
 ("Pear","🍐","Fruits","Pears, raw",["pears"]),
 ("Cherries","🍒","Fruits","Cherries, sweet, raw",["cherry"]),
 ("Kiwi","🥝","Fruits","Kiwifruit, green, raw",["kiwifruit"]),
 ("Avocado","🥑","Fruits","Avocados, raw, all commercial varieties",["avocados","guacamole base"]),
 ("Lemon","🍋","Fruits","Lemons, raw, without peel",[]),
 ("Lime","🍋","Fruits","Limes, raw",[]),
 ("Grapefruit","🍊","Fruits","Grapefruit, raw, pink and red and white, all areas",[]),
 ("Plum","🍑","Fruits","Plums, raw",["plums"]),
 ("Clementine","🍊","Fruits","Clementines, raw",["mandarin","cutie"]),
 ("Raisins","🍇","Fruits","Raisins, seedless",["raisin"]),
 ("Dates (Medjool)","🌴","Fruits","Dates, medjool",["date","dates"]),
 ("Coconut meat","🥥","Fruits","Nuts, coconut meat, raw",["coconut"]),
 ("Applesauce, unsweetened","🍎","Fruits","Applesauce, canned, unsweetened, without added ascorbic acid (includes USDA commodity)",["apple sauce"]),
 # Vegetables
 ("Broccoli","🥦","Vegetables","Broccoli, raw",[]),
 ("Broccoli, cooked","🥦","Vegetables","Broccoli, cooked, boiled, drained, without salt",["steamed broccoli"]),
 ("Carrot","🥕","Vegetables","Carrots, raw",["carrots"]),
 ("Baby carrots","🥕","Vegetables","Carrots, baby, raw",[]),
 ("Spinach","🥬","Vegetables","Spinach, raw",[]),
 ("Romaine lettuce","🥬","Vegetables","Lettuce, cos or romaine, raw",["lettuce","romaine"]),
 ("Iceberg lettuce","🥬","Vegetables","Lettuce, iceberg (includes crisphead types), raw",[]),
 ("Kale","🥬","Vegetables","Kale, raw",[]),
 ("Tomato","🍅","Vegetables","Tomatoes, red, ripe, raw, year round average",["tomatoes"]),
 ("Cherry tomatoes","🍅","Vegetables","Tomatoes, red, ripe, raw, year round average",["grape tomatoes"]),
 ("Cucumber","🥒","Vegetables","Cucumber, with peel, raw",["cucumbers"]),
 ("Bell pepper, red","🫑","Vegetables","Peppers, sweet, red, raw",["red pepper"]),
 ("Bell pepper, green","🫑","Vegetables","Peppers, sweet, green, raw",["green pepper"]),
 ("Onion","🧅","Vegetables","Onions, raw",["onions"]),
 ("Garlic","🧄","Vegetables","Garlic, raw",[]),
 ("Potato, baked","🥔","Vegetables","Potatoes, baked, flesh and skin, without salt",["potato","baked potato"]),
 ("Sweet potato, baked","🍠","Vegetables","Sweet potato, cooked, baked in skin, flesh, without salt",["sweet potato","yam"]),
 ("Corn, sweet","🌽","Vegetables","Corn, sweet, yellow, cooked, boiled, drained, without salt",["corn","corn on the cob"]),
 ("Green beans","🫛","Vegetables","Beans, snap, green, cooked, boiled, drained, without salt",["string beans"]),
 ("Peas, green","🫛","Vegetables","Peas, green, frozen, cooked, boiled, drained, without salt",["peas"]),
 ("Cauliflower","🥦","Vegetables","Cauliflower, raw",[]),
 ("Zucchini","🥒","Vegetables","Squash, summer, zucchini, includes skin, raw",[]),
 ("Mushrooms","🍄","Vegetables","Mushrooms, white, raw",["mushroom"]),
 ("Asparagus","🌱","Vegetables","Asparagus, cooked, boiled, drained",[]),
 ("Brussels sprouts","🥬","Vegetables","Brussels sprouts, cooked, boiled, drained, without salt",[]),
 ("Cabbage","🥬","Vegetables","Cabbage, raw",[]),
 ("Celery","🥬","Vegetables","Celery, raw",[]),
 ("Edamame","🫛","Vegetables","Edamame, frozen, prepared",["soybeans"]),
 ("Jalapeño","🌶️","Vegetables","Peppers, jalapeno, raw",["jalapeno"]),
 # Proteins
 ("Egg, large","🥚","Proteins","Egg, whole, raw, fresh",["egg","eggs"]),
 ("Egg, hard-boiled","🥚","Proteins","Egg, whole, cooked, hard-boiled",["boiled egg"]),
 ("Egg, scrambled","🍳","Proteins","Egg, whole, cooked, scrambled",["scrambled eggs"]),
 ("Egg, fried","🍳","Proteins","Egg, whole, cooked, fried",["fried egg"]),
 ("Egg whites","🥚","Proteins","Egg, white, raw, fresh",["egg white"]),
 ("Chicken breast, cooked","🍗","Proteins","Chicken, broilers or fryers, breast, meat only, cooked, roasted",["chicken breast","chicken"]),
 ("Chicken thigh, cooked","🍗","Proteins","Chicken, broilers or fryers, thigh, meat only, cooked, roasted",["chicken thigh"]),
 ("Chicken drumstick, cooked","🍗","Proteins","Chicken, broilers or fryers, dark meat, drumstick, meat only, cooked, roasted",["drumstick"]),
 ("Chicken wings, cooked","🍗","Proteins","Chicken, broilers or fryers, wing, meat and skin, cooked, roasted",["wings"]),
 ("Ground beef 85/15, cooked","🥩","Proteins","Beef, ground, 85% lean meat / 15% fat, patty, cooked, broiled",["ground beef","hamburger patty"]),
 ("Ground beef 93/7, cooked","🥩","Proteins","Beef, ground, 93% lean meat / 7% fat, patty, cooked, broiled",["lean ground beef"]),
 ("Steak (sirloin), cooked","🥩","Proteins","Beef, top sirloin, steak, separable lean and fat, trimmed to 1/8\" fat, all grades, cooked, broiled",["steak","sirloin"]),
 ("Ground turkey, cooked","🦃","Proteins","Ground turkey, cooked",["ground turkey"]),
 ("Turkey breast, roasted","🦃","Proteins","Turkey, retail parts, breast, meat only, cooked, roasted",["turkey"]),
 ("Pork chop, cooked","🥩","Proteins","Pork, fresh, loin, center loin (chops), bone-in, separable lean and fat, cooked, broiled",["pork chop"]),
 ("Bacon, cooked","🥓","Proteins","Pork, cured, bacon, cooked, baked",["bacon"]),
 ("Ham, sliced","🍖","Proteins","Ham, sliced, regular (approximately 11% fat)",["ham"]),
 ("Salmon, cooked","🐟","Proteins","Fish, salmon, Atlantic, farmed, cooked, dry heat",["salmon"]),
 ("Tuna, canned in water","🐟","Proteins","Fish, tuna, light, canned in water, drained solids",["tuna","canned tuna"]),
 ("Tilapia, cooked","🐟","Proteins","Fish, tilapia, cooked, dry heat",["tilapia"]),
 ("Cod, cooked","🐟","Proteins","Fish, cod, Atlantic, cooked, dry heat",["cod"]),
 ("Shrimp, cooked","🍤","Proteins","Crustaceans, shrimp, mixed species, cooked, moist heat (may have been previously frozen)",["shrimp","prawns"]),
 ("Tofu, firm","🧈","Proteins","Tofu, firm, prepared with calcium sulfate and magnesium chloride (nigari)",["tofu"]),
 ("Black beans, cooked","🫘","Proteins","Beans, black, mature seeds, cooked, boiled, without salt",["black beans"]),
 ("Chickpeas, cooked","🫘","Proteins","Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt",["chickpeas","garbanzo"]),
 ("Lentils, cooked","🫘","Proteins","Lentils, mature seeds, cooked, boiled, without salt",["lentils"]),
 ("Pinto beans, cooked","🫘","Proteins","Beans, pinto, mature seeds, cooked, boiled, without salt",["pinto beans"]),
 ("Kidney beans, cooked","🫘","Proteins","Beans, kidney, all types, mature seeds, cooked, boiled, without salt",["kidney beans"]),
 ("Hummus","🫘","Proteins","Hummus, commercial",[]),
 # Dairy
 ("Milk, whole","🥛","Dairy","Milk, whole, 3.25% milkfat, with added vitamin D",["milk","whole milk"]),
 ("Milk, 2%","🥛","Dairy","Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D",["2% milk"]),
 ("Milk, skim","🥛","Dairy","Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim)",["skim milk","nonfat milk"]),
 ("Greek yogurt, plain nonfat","🥣","Dairy","Yogurt, Greek, plain, nonfat",["greek yogurt"]),
 ("Yogurt, plain whole milk","🥣","Dairy","Yogurt, plain, whole milk, 8 grams protein per 8 ounce",["yogurt"]),
 ("Cottage cheese, 2%","🥣","Dairy","Cheese, cottage, lowfat, 2% milkfat",["cottage cheese"]),
 ("Cheddar cheese","🧀","Dairy","Cheese, cheddar",["cheddar","cheese"]),
 ("Mozzarella, part-skim","🧀","Dairy","Cheese, mozzarella, part skim milk",["mozzarella"]),
 ("Parmesan, grated","🧀","Dairy","Cheese, parmesan, grated",["parmesan"]),
 ("American cheese slice","🧀","Dairy","Cheese, pasteurized process, American, fortified with vitamin D",["american cheese"]),
 ("Cream cheese","🧀","Dairy","Cheese, cream",[]),
 ("Butter","🧈","Dairy","Butter, salted",[]),
 ("Heavy cream","🥛","Dairy","Cream, fluid, heavy whipping",["whipping cream"]),
 ("Half and half","🥛","Dairy","Cream, fluid, half and half",["half & half"]),
 ("Sour cream","🥣","Dairy","Cream, sour, cultured",[]),
 ("Ice cream, vanilla","🍨","Dairy","Ice creams, vanilla",["ice cream"]),
 # Grains & bread
 ("White rice, cooked","🍚","Grains","Rice, white, long-grain, regular, enriched, cooked",["rice","white rice"]),
 ("Brown rice, cooked","🍚","Grains","Rice, brown, long-grain, cooked",["brown rice"]),
 ("Pasta, cooked","🍝","Grains","Pasta, cooked, enriched, without added salt",["pasta","spaghetti","noodles"]),
 ("Whole wheat pasta, cooked","🍝","Grains","Pasta, whole-wheat, cooked",[]),
 ("Oatmeal, cooked with water","🥣","Grains","Cereals, oats, regular and quick, unenriched, cooked with water (includes boiling and microwaving), without salt",["oatmeal","porridge"]),
 ("Rolled oats, dry","🥣","Grains","Cereals, oats, regular and quick, not fortified, dry",["oats"]),
 ("Quinoa, cooked","🍚","Grains","Quinoa, cooked",["quinoa"]),
 ("White bread","🍞","Grains","Bread, white, commercially prepared (includes soft bread crumbs)",["bread","toast"]),
 ("Whole wheat bread","🍞","Grains","Bread, whole-wheat, commercially prepared",["wheat bread"]),
 ("Sourdough bread","🍞","Grains","Bread, french or vienna (includes sourdough)",["sourdough","french bread"]),
 ("Bagel, plain","🥯","Grains","Bagels, plain, enriched, with calcium propionate (includes onion, poppy, sesame)",["bagel"]),
 ("English muffin","🍞","Grains","English muffins, plain, enriched, with ca prop (includes sourdough)",[]),
 ("Flour tortilla","🌯","Grains","Tortillas, ready-to-bake or -fry, flour, refrigerated",["tortilla"]),
 ("Corn tortilla","🌮","Grains","Tortillas, ready-to-bake or -fry, corn",[]),
 ("Croissant, butter","🥐","Grains","Croissants, butter",["croissant"]),
 ("Pancakes","🥞","Grains","Pancakes, plain, prepared from recipe",["pancake"]),
 ("Waffle","🧇","Grains","Waffles, plain, prepared from recipe",["waffles"]),
 ("Popcorn, air-popped","🍿","Grains","Snacks, popcorn, air-popped",["popcorn"]),
 # Nuts, seeds, fats
 ("Almonds","🥜","Nuts & Fats","Nuts, almonds",["almond"]),
 ("Peanuts, dry roasted","🥜","Nuts & Fats","Peanuts, all types, dry-roasted, without salt",["peanuts"]),
 ("Peanut butter","🥜","Nuts & Fats","Peanut butter, smooth style, without salt",["pb"]),
 ("Almond butter","🥜","Nuts & Fats","Nuts, almond butter, plain, without salt added",[]),
 ("Cashews","🥜","Nuts & Fats","Nuts, cashew nuts, raw",["cashew"]),
 ("Walnuts","🥜","Nuts & Fats","Nuts, walnuts, english",["walnut"]),
 ("Pistachios","🥜","Nuts & Fats","Nuts, pistachio nuts, raw",["pistachio"]),
 ("Chia seeds","🌱","Nuts & Fats","Seeds, chia seeds, dried",["chia"]),
 ("Flaxseed, ground","🌱","Nuts & Fats","Seeds, flaxseed",["flax"]),
 ("Sunflower seeds","🌻","Nuts & Fats","Seeds, sunflower seed kernels, dried",[]),
 ("Olive oil","🫒","Nuts & Fats","Oil, olive, salad or cooking",["oil"]),
 ("Vegetable oil (canola)","🫗","Nuts & Fats","Oil, canola",["canola oil","cooking oil"]),
 ("Coconut oil","🥥","Nuts & Fats","Oil, coconut",[]),
 ("Mayonnaise","🥫","Nuts & Fats","Salad dressing, mayonnaise, regular",["mayo"]),
 # Drinks
 ("Coffee, black","☕","Drinks","Beverages, coffee, brewed, prepared with tap water",["coffee"]),
 ("Tea, unsweetened","🍵","Drinks","Beverages, tea, black, brewed, prepared with tap water",["tea"]),
 ("Orange juice","🧃","Drinks","Orange juice, raw",["oj"]),
 ("Apple juice","🧃","Drinks","Apple juice, canned or bottled, unsweetened, without added ascorbic acid",[]),
 ("Cola","🥤","Drinks","Beverages, carbonated, cola, regular",["soda","coke","pop"]),
 ("Beer","🍺","Drinks","Alcoholic beverage, beer, regular, all",[]),
 ("Light beer","🍺","Drinks","Alcoholic beverage, beer, light",[]),
 ("Red wine","🍷","Drinks","Alcoholic beverage, wine, table, red",["wine"]),
 ("White wine","🥂","Drinks","Alcoholic beverage, wine, table, white",[]),
 ("Vodka / whiskey (80 proof)","🥃","Drinks","Alcoholic beverage, distilled, all (gin, rum, vodka, whiskey) 80 proof",["vodka","whiskey","rum","gin","liquor","shot"]),
 ("Almond milk, unsweetened","🥛","Drinks","Beverages, almond milk, unsweetened, shelf stable",["almond milk"]),
 ("Soy milk","🥛","Drinks","Soymilk (all flavors), unsweetened, with added calcium, vitamins A and D",[]),
 ("Sports drink (Powerade)","🥤","Drinks","Beverages, COCA-COLA, POWERADE, lemon-lime flavored, ready-to-drink",[]),
 # Snacks & sweets
 ("Dark chocolate (70–85%)","🍫","Snacks & Sweets","Chocolate, dark, 70-85% cacao solids",["dark chocolate"]),
 ("Milk chocolate","🍫","Snacks & Sweets","Candies, milk chocolate",["chocolate"]),
 ("Potato chips","🥔","Snacks & Sweets","Snacks, potato chips, plain, salted",["chips"]),
 ("Tortilla chips","🌮","Snacks & Sweets","Snacks, tortilla chips, plain, white corn, salted",[]),
 ("Pretzels","🥨","Snacks & Sweets","Snacks, pretzels, hard, plain, salted",["pretzel"]),
 ("Glazed donut","🍩","Snacks & Sweets","Doughnuts, yeast-leavened, glazed, enriched (includes honey buns)",["donut","doughnut"]),
 ("Chocolate chip cookie","🍪","Snacks & Sweets","Cookies, chocolate chip, commercially prepared, regular, higher fat, enriched",["cookie","cookies"]),
 ("Granola bar","🍫","Snacks & Sweets","Snacks, granola bars, hard, plain",[]),
 ("Honey","🍯","Snacks & Sweets","Honey",[]),
 ("Sugar","🧂","Snacks & Sweets","Sugars, granulated",["white sugar"]),
 ("Maple syrup","🍁","Snacks & Sweets","Syrups, maple",["syrup"]),
 ("Jam / jelly","🍓","Snacks & Sweets","Jams and preserves",["jam","jelly"]),
 # Fast food & common dishes
 ("Pepperoni pizza slice","🍕","Prepared","Fast Food, Pizza Chain, 14\" pizza, pepperoni topping, regular crust",["pizza"]),
 ("Cheese pizza slice","🍕","Prepared","Fast Food, Pizza Chain, 14\" pizza, cheese topping, regular crust",["cheese pizza"]),
 ("Hamburger (single patty)","🍔","Prepared","Fast foods, hamburger; single, regular patty; plain",["hamburger","burger"]),
 ("Cheeseburger","🍔","Prepared","Fast foods, cheeseburger; single, regular patty; plain",[]),
 ("French fries","🍟","Prepared","Fast foods, potato, french fried in vegetable oil",["fries"]),
 ("Hot dog","🌭","Prepared","Fast foods, hotdog, plain",["hotdog"]),
 ("Chicken nuggets","🍗","Prepared","Fast foods, chicken tenders",["nuggets","chicken tenders"]),
 ("Burrito, bean and cheese","🌯","Prepared","Fast foods, burrito, with beans and cheese",["burrito"]),
 ("Taco, beef","🌮","Prepared","TACO BELL, Soft Taco with beef, cheese and lettuce",["taco"]),
 ("Macaroni and cheese","🧀","Prepared","Macaroni and cheese, frozen entree",["mac and cheese"]),
 ("Ranch dressing","🥗","Prepared","Salad dressing, ranch dressing, regular",["ranch"]),
 ("Ketchup","🍅","Prepared","Catsup",["catsup"]),
 ("Mustard","🌭","Prepared","Mustard, prepared, yellow",[]),
 ("Salsa","🌶️","Prepared","Sauce, salsa, ready-to-serve",[]),
 ("Soy sauce","🥢","Prepared","Soy sauce made from soy and wheat (shoyu)",[]),
 ("Fried rice","🍚","Prepared","Restaurant, Chinese, fried rice, without meat",[]),
]

NUT = {'208':'calories','203':'proteins','204':'fat','205':'carbohydrates','291':'fiber','269':'sugars',
       '307':'sodium','606':'saturated-fat','601':'cholesterol','306':'potassium','301':'calcium','303':'iron','401':'vitamin-c'}
# Default portion per food: a regex tried in order against USDA's household
# portions, or ('label', grams) for a portion USDA doesn't list.
DEFAULTS = {
 'Cantaloupe':r'^1 cup','Mango':r'^1 cup','Kiwi':r'^1 fruit|^1 medium','Plum':r'^1 fruit','Raisins':r'1 small box|^1 oz',
 'Coconut meat':r'1 piece','Broccoli, cooked':r'^0\.5 cup|^1 cup','Iceberg lettuce':r'^1 cup','Cherry tomatoes':r'cherry',
 'Garlic':r'^1 clove','Cauliflower':r'^1 cup','Mushrooms':r'^1 cup','Cabbage':r'^1 cup','Jalapeño':r'^1 pepper',
 'Turkey breast, roasted':r'^3 oz','Shrimp, cooked':r'^3 oz','Tuna, canned in water':r'^1 can','Salmon, cooked':r'^3 oz',
 'Hummus':r'^1 tbsp','Parmesan, grated':r'^1 tbsp','Cream cheese':r'^1 tbsp','Butter':r'^1 tbsp','Heavy cream':r'fl oz',
 'Half and half':r'^1 tbsp','Sour cream':r'^1 tbsp','Pancakes':r'pancake','Almonds':r'^1 oz','Peanuts, dry roasted':r'^1 oz',
 'Peanut butter':r'^2 tbsp','Almond butter':r'^1 tbsp','Walnuts':r'^1 oz','Pistachios':r'^1 oz','Flaxseed, ground':r'^1 tbsp',
 'Olive oil':r'^1 tablespoon','Vegetable oil (canola)':r'^1 tbsp','Coconut oil':r'^1 tbsp','Mayonnaise':r'^1 tbsp',
 'Beer':r'^1 can','Dark chocolate (70–85%)':r'^1 oz','Milk chocolate':r'1\.55 oz','Honey':r'^1 tbsp','Sugar':r'^1 tsp',
 'Ketchup':r'^1 tbsp','Mustard':r'^1 tsp','Soy sauce':r'^1 tbsp','Lemon':r'^1 fruit',
 'Strawberries':r'^1 cup, sliced|^1 cup','Tomato':r'^1 medium whole|^1 medium','Onion':r'^1 medium',
 'Chicken breast, cooked':('3 oz',85.0),'Sunflower seeds':('1 oz',28.35),'Sourdough bread':('1 slice (about 2 oz)',56.7),
 'Avocado':'HALF:1 avocado',
}
PRI = [('slice',30),('1 egg',30),('large',25),('piece',22),('fillet',22),('breast',22),('thigh',22),('drumstick',22),
       ('wing',20),('patty',22),('bagel',25),('muffin',25),('tortilla',25),('croissant',25),('pancake',25),('waffle',25),
       ('doughnut',22),('cookie',22),('bar',20),('sandwich',22),('item',20),('serving',18),('cup',15),('oz',12),('tbsp',10),('tsp',5)]

def score(name, cat, lbl):
    l, n, s = lbl.lower(), name.lower(), 0
    if any(b in l for b in ['extra large','jumbo','small','very large','nlea','package','container','pan','loaf','pie','recipe','yield','cubic','lb']): s -= 50
    if cat == 'Drinks':
        if 'can or bottle' in l or '12 fl oz' in l: s += 40
        if '5 fl oz' in l: s += 38
        if '1.5 fl oz' in l or 'jigger' in l: s += 39
        if l.startswith('1 cup'): s += 30
        if l.startswith('1 fl'): s -= 10
    if 'large' in n:
        if 'large' in l: s += 40
    elif 'medium' in l: s += 35
    for w, v in PRI:
        if w in l: s += v; break
    return s

def main(d):
    des = {}
    for line in open(os.path.join(d, 'FOOD_DES.txt'), encoding='latin-1'):
        f = line.rstrip('\r\n').split('^'); des[f[2].strip('~')] = f[0].strip('~')
    missing = [c[0] for c in C if c[3] not in des]
    if missing: sys.exit('Not in SR28: ' + ', '.join(missing))
    want = {des[c[3]] for c in C}
    nut, wt = {}, {}
    for line in open(os.path.join(d, 'NUT_DATA.txt'), encoding='latin-1'):
        f = line.split('^', 3); ndb = f[0].strip('~'); nid = f[1].strip('~')
        if ndb in want and nid in NUT:
            try: nut.setdefault(ndb, {})[NUT[nid]] = round(float(f[2]), 2)
            except ValueError: pass
    for line in open(os.path.join(d, 'WEIGHT.txt'), encoding='latin-1'):
        f = line.rstrip('\r\n').split('^'); ndb = f[0].strip('~')
        if ndb in want and float(f[4]) > 0:
            wt.setdefault(ndb, []).append({'label': f"{float(f[2]):g} {f[3].strip('~')}", 'grams': round(float(f[4]), 1)})
    out = []
    for name, icon, cat, desc, aliases in C:
        ndb = des[desc]; ws = wt.get(ndb, [])
        rule = DEFAULTS.get(name); chosen = None
        if isinstance(rule, tuple): chosen = {'label': rule[0], 'grams': rule[1]}
        elif isinstance(rule, str) and rule.startswith('HALF:'):
            w = next(w for w in ws if w['label'].startswith(rule[5:])); chosen = {'label': '½ ' + name.split(',')[0].lower(), 'grams': round(w['grams'] / 2, 1)}
        elif isinstance(rule, str):
            for alt in rule.split('|'):
                m = [w for w in ws if re.search(alt, w['label'], re.I)]
                if m: chosen = m[0]; break
        if not chosen and ws:
            chosen = max(ws, key=lambda w: (score(name, cat, w['label']), -ws.index(w)))
        servings, seen = [], set()
        for w in ([chosen] if chosen else []) + ws:          # chosen first, no repeated labels
            if w['label'] not in seen and len(servings) < 8:
                seen.add(w['label']); servings.append(w)
        out.append({'id': 'common-' + re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-'), 'ndb': ndb, 'name': name, 'icon': icon, 'category': cat, 'aliases': aliases,
                    'usda': desc, 'per100g': nut[ndb], 'servings': servings, 'defaultServing': 0 if servings else None})
    dst = os.path.join(os.path.dirname(__file__), '..', 'src', 'lib', 'common-foods-data.js')
    with open(dst, 'w') as fh:
        fh.write('// Generated from USDA SR28 (public domain) by scripts/build-common-foods.py — do not edit by hand.\n')
        fh.write(f'// {len(out)} everyday foods: per-100 g nutrients + USDA household portions.\n')
        fh.write('export default ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(f'{len(out)} foods → {dst}')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'data')
