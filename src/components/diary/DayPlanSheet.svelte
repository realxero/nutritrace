<!--
  DayPlanSheet (fork): "Plan my whole day".

  Builds a simple meal plan from what is left of the day's calories and protein
  (today, or a day ahead), using foods you can eat: allergies, diet, dislikes and
  never-suggest foods are all respected. Tap an item to swap it for a similar one
  or drop it; Shuffle for a different plan. Then add the whole day (or one meal) to
  the diary with Undo, or put it on the shopping list.

  Rules live in lib/day-plan.js. Nothing is added until you press a button.
-->
<script>
  import { NtApi } from '../../lib/api.js';
  import { DB } from '../../lib/db.js';
  import Sheet from '../ui/Sheet.svelte';
  import ActionSheet from '../ui/ActionSheet.svelte';
  import FoodIcon from '../ui/FoodIcon.svelte';
  import ShoppingListSheet from './ShoppingListSheet.svelte';
  import { dayContext } from '../../lib/better-options.js';
  import { limitFor } from '../../lib/day-suggestions.js';
  import { planDay, swapPlanItem, removePlanItem, planToDiaryRows, dishFromMeal } from '../../lib/day-plan.js';
  import WeekPlanSheet from './WeekPlanSheet.svelte';
  import { itemsToShopping, mergeShopping } from '../../lib/shopping.js';
  import { addSuggestedFood, undoAdd } from '../../lib/suggestion-actions.js';
  import { hasPrefs, SAFETY_NOTE, ALLERGENS } from '../../lib/food-safety.js';
  import { mealNames, mutedSuggestionFoods, foodPrefs, shoppingList } from '../../stores/settings.js';
  import { showError, showSuccess, showUndo } from '../../stores/toast.js';

  export let open = false;
  export let date = '';
  export let items = [];
  export let calorieGoal = null;
  export let proteinGoal = null;
  export let limits = {};

  let saved = [];
  let dishes = [];
  let loadedLib = false;
  let showWeek = false;
  let seed = 0;
  let plan = null;
  let busy = false;
  let menu = null;            // { mealPos, itemPos }
  let menuOpen = false;
  let showList = false;
  let loadedFor = '';

  $: names = $mealNames || ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
  $: slots = names.map((name, idx) => ({ idx, name, hasItems: (items || []).some(i => (Number(i.meal) || 0) === idx) }));
  $: ctx = dayContext({ items, calorieGoal, proteinGoal, limitFor, limits });
  $: prefsOn = hasPrefs($foodPrefs);
  $: prefsLine = [
    ...($foodPrefs.allergens || []).map(a => ALLERGENS.find(x => x.id === a)?.label || a),
    ...($foodPrefs.avoid || []),
    ...($foodPrefs.diet && $foodPrefs.diet !== 'none' ? [$foodPrefs.diet] : []),
  ].join(', ');

  // Build when the sheet opens, and again on Shuffle.
  $: if (open && loadedFor !== date + '|' + seed) { loadedFor = date + '|' + seed; build(); }
  $: if (!open) { loadedFor = ''; seed = 0; plan = null; }

  async function build() {
    if (!loadedLib) {
      loadedLib = true;
      try { saved = await NtApi.getFoods(); } catch { saved = []; }
      // Their own meals and recipes can stand in for a whole lunch or dinner.
      try {
        const [m, r] = await Promise.all([NtApi.getMeals().catch(() => []), NtApi.getRecipes().catch(() => [])]);
        dishes = [...m.map(x => dishFromMeal(x, false)), ...r.map(x => dishFromMeal(x, true))].filter(Boolean);
      } catch { dishes = []; }
    }
    plan = planDay({
      meals: slots, remaining: { calories: ctx.remaining.calories, protein: ctx.remaining.protein },
      limits, prefs: $foodPrefs, saved, dishes, muted: $mutedSuggestionFoods || [], seed,
    });
  }

  function openItem(mealPos, itemPos) { menu = { mealPos, itemPos }; menuOpen = true; }
  $: menuActions = (() => {
    if (!menu || !plan) return [];
    const it = plan.meals[menu.mealPos]?.items[menu.itemPos];
    if (!it) return [];
    return [
      ...it.alts.map((a, n) => ({ label: `Swap for ${a.food.name}${a.food.brand && a.food.brand !== 'USDA' ? ` (${a.food.brand})` : ''} · ${Math.round(a.quantity * (a.food.nutrition?.calories || 0))} kcal`, icon: 'swap_horiz', value: `alt:${n}` })),
      { label: 'Remove from plan', icon: 'delete', value: 'remove', danger: true },
    ];
  })();
  function onMenu(e) {
    const v = String(e.detail?.value || '');
    if (!menu) return;
    if (v === 'remove') plan = removePlanItem(plan, menu.mealPos, menu.itemPos);
    else if (v.startsWith('alt:')) plan = swapPlanItem(plan, menu.mealPos, menu.itemPos, Number(v.slice(4)));
    menu = null;
  }

  const qtyLabel = (i) => `${i.quantity} × ${i.food.portion} ${i.food.unit}`;

  async function addRows(rows, label) {
    if (busy || !rows.length) return;
    busy = true;
    const added = [];
    try {
      for (const r of rows) {
        const { item } = await addSuggestedFood(r.food, { meal: r.meal, date, saved, quantity: r.quantity });
        added.push(item);
      }
      showUndo(`Added ${label} to your diary`, async () => { for (const it of added) await undoAdd(date, it); });
      open = false;
    } catch (e) {
      showError(e?.message || 'Could not add everything');
      if (added.length) showUndo(`Added ${added.length} of ${rows.length} items`, async () => { for (const it of added) await undoAdd(date, it); });
    }
    busy = false;
  }
  const addAll = () => addRows(planToDiaryRows(plan), 'the whole plan');
  const addMeal = (m) => addRows(planToDiaryRows(plan, { onlyMeal: m.idx }), m.name);

  function toList() {
    const rows = planToDiaryRows(plan).map(r => ({ name: r.food.name, quantity: r.quantity, portion: r.food.portion, unit: r.food.unit }));
    shoppingList.set(mergeShopping($shoppingList || [], itemsToShopping(rows)));
    showSuccess('Added to your shopping list');
    showList = true;
  }
</script>

<Sheet bind:open title="Plan my day">
  <div class="dp" data-testid="day-plan">
    {#if !plan}
      <p class="dp-sub">Building a plan…</p>
    {:else if plan.needsGoal}
      <p class="dp-sub">Set a calorie goal on the Goals page and I can plan the day around it.</p>
    {:else if plan.full}
      <p class="dp-sub">You have already reached your calories for this day, so there is nothing left to plan.</p>
    {:else if plan.allFilled}
      <p class="dp-sub">Every meal on this day already has food in it. Clear a meal to plan it.</p>
    {:else}
      <p class="dp-sub">
        Planning about <strong>{plan.targets.calories.toLocaleString()} kcal</strong> and <strong>{plan.targets.protein} g protein</strong>{plan.targets.proteinDefault ? ' (a typical share, since no protein goal is set)' : ''}.
      </p>
      {#if prefsOn}<p class="dp-prefs" data-testid="plan-prefs">Avoiding: {prefsLine || 'your dislikes'}.</p>{/if}

      {#each plan.meals as m, mp (m.idx)}
        <section class="dp-meal">
          <div class="dp-meal-head">
            <h3>{m.name}</h3>
            <span class="dp-sub">{m.items.reduce((a, i) => a + i.kcal, 0)} kcal</span>
            <button type="button" class="dp-mini" disabled={busy} on:click={() => addMeal(m)} data-testid="plan-add-meal">Add</button>
          </div>
          <ul class="dp-items">
            {#each m.items as it, ip (it.id)}
              <li>
                <button type="button" class="dp-item" on:click={() => openItem(mp, ip)} aria-label="Change {it.food.name}">
                  <span class="dp-thumb"><FoodIcon name={it.food.name} icon={it.food.icon} brand={it.food.brand} size={22} /></span>
                  <span class="dp-body">
                    <span class="dp-name">{it.food.name}{#if it.food.brand && it.food.brand !== 'USDA'} <span class="dp-brand">· {it.food.brand}</span>{/if}{#if it.yours} <span class="dp-yours">yours</span>{/if}</span>
                    <span class="dp-sub">{qtyLabel(it)} · {it.kcal} kcal · {it.protein} g protein</span>
                  </span>
                  <span class="material-symbols-rounded dp-chev" aria-hidden="true">more_horiz</span>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/each}

      <div class="dp-total">
        <strong>{plan.totals.calories.toLocaleString()} kcal · {plan.totals.proteins} g protein</strong>
        <span class="dp-sub">{plan.totals.fiber} g fiber · {plan.totals.sodium.toLocaleString()} mg sodium</span>
      </div>
      {#each plan.notes as n}<p class="dp-note">{n}</p>{/each}
      {#if prefsOn}<p class="dp-safety">{SAFETY_NOTE}</p>{/if}

      <div class="dp-actions">
        <button type="button" class="btn btn-primary w-full" disabled={busy || !plan.meals.length} on:click={addAll} data-testid="plan-add-all">Add whole plan to my diary</button>
        <div class="dp-row2">
          <button type="button" class="btn btn-secondary" on:click={() => (seed += 1)} data-testid="plan-shuffle">
            <span class="material-symbols-rounded" style="font-size:18px" aria-hidden="true">shuffle</span> Shuffle
          </button>
          <button type="button" class="btn btn-secondary" disabled={!plan.meals.length} on:click={toList} data-testid="plan-to-list">
            <span class="material-symbols-rounded" style="font-size:18px" aria-hidden="true">shopping_cart</span> Shopping list
          </button>
        </div>
        <button type="button" class="btn btn-ghost w-full" on:click={() => (showWeek = true)} data-testid="plan-week-open">
          <span class="material-symbols-rounded" style="font-size:18px" aria-hidden="true">date_range</span> Plan the whole week instead
        </button>
      </div>
    {/if}
  </div>
</Sheet>

<ActionSheet bind:open={menuOpen} title={menu && plan ? (plan.meals[menu.mealPos]?.items[menu.itemPos]?.food.name || '') : ''} actions={menuActions} on:select={onMenu} />
<ShoppingListSheet bind:open={showList} />
<WeekPlanSheet bind:open={showWeek} {saved} {dishes} {limits} {calorieGoal} {proteinGoal} />

<style>
  .dp { display: flex; flex-direction: column; gap: 8px; padding-bottom: 6px; }
  .dp-sub { margin: 0; font-size: 12.5px; line-height: 1.4; color: var(--text-3); }
  .dp-prefs { margin: 0; font-size: 13px; color: var(--text-2); }
  .dp-meal { margin-top: 6px; }
  .dp-meal-head { display: flex; align-items: center; gap: 10px; }
  .dp-meal-head h3 { margin: 0; flex: 1; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); }
  .dp-mini { min-height: 36px; padding: 0 14px; border-radius: 999px; border: 0; background: var(--accent-dim); color: var(--accent); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
  .dp-mini:disabled { opacity: .5; }
  .dp-items { list-style: none; margin: 4px 0 0; padding: 0; }
  .dp-item { width: 100%; min-height: 56px; display: flex; align-items: center; gap: 12px; padding: 6px 0; background: none; border: 0; border-bottom: 1px solid var(--border); text-align: left; color: var(--text-1); font: inherit; cursor: pointer; }
  .dp-items li:last-child .dp-item { border-bottom: 0; }
  .dp-thumb { width: 36px; height: 36px; flex-shrink: 0; border-radius: var(--radius-sm); background: var(--accent-dim); display: flex; align-items: center; justify-content: center; }
  .dp-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .dp-name { font-size: 15px; font-weight: 600; }
  .dp-brand { font-weight: 400; color: var(--text-3); }
  .dp-yours { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; background: var(--accent-dim); color: var(--accent); vertical-align: 1px; }
  .dp-chev { color: var(--text-3); }
  .dp-total { margin-top: 10px; padding: 12px; border-radius: var(--radius-sm); background: var(--accent-dim); display: flex; flex-direction: column; gap: 2px; }
  .dp-note { margin: 0; font-size: 13px; line-height: 1.4; color: #eab308; }
  .dp-safety { margin: 0; font-size: 12px; line-height: 1.45; color: var(--text-3); }
  .dp-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
  .dp-row2 { display: flex; gap: 8px; }
  .dp-row2 .btn { flex: 1; }
</style>
