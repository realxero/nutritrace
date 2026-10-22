<!--
  WeekPlanSheet (fork): "Plan the whole week".

  Plans the next 7 days with the same rules as the day planner (allergies, diet,
  dislikes, never-suggest, your own foods and recipes), a different plan each day and no
  repeating yesterday's main. Meals that already have food on a day are left alone.
  Then: add the week to the diary (one Undo), or build ONE shopping list for the week.
-->
<script>
  import { NtApi } from '../../lib/api.js';
  import { localDateStr } from '../../lib/db.js';
  import Sheet from '../ui/Sheet.svelte';
  import ShoppingListSheet from './ShoppingListSheet.svelte';
  import { planWeek, planDay, planToDiaryRows } from '../../lib/day-plan.js';
  import { itemsToShopping, mergeShopping } from '../../lib/shopping.js';
  import { addSuggestedFood, undoAdd } from '../../lib/suggestion-actions.js';
  import { dayTotals } from '../../lib/suggestions.js';
  import { hasPrefs, SAFETY_NOTE } from '../../lib/food-safety.js';
  import { mealNames, mutedSuggestionFoods, foodPrefs, shoppingList, goals } from '../../stores/settings.js';
  import { resolveGoalFor } from '../../lib/goal-resolver.js';
  import { showError, showSuccess, showUndo } from '../../stores/toast.js';

  export let open = false;
  export let saved = [];
  export let dishes = [];
  export let limits = {};
  export let calorieGoal = null;     // fallback when a day has no goal of its own
  export let proteinGoal = null;

  let days = [];                     // [{ date, label, items, plan }]
  let seed = 0;
  let loading = false;
  let busy = false;
  let expanded = new Set();
  let showList = false;
  let builtFor = '';

  $: names = $mealNames || ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
  $: if (open && builtFor !== `${seed}`) { builtFor = `${seed}`; build(); }
  $: if (!open) { builtFor = ''; seed = 0; days = []; expanded = new Set(); }

  const dayLabel = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };
  // A percent goal (e.g. protein as % of calories) is not grams, so it falls back to the figure the Diary worked out.
  const goalFor = (date, key, fallback) => { const g = $goals?.[key]; if (!g || g.isPercent) return fallback; const v = resolveGoalFor(g, date); return v != null && v > 0 ? v : fallback; };

  async function build() {
    loading = true;
    try {
      const dates = [];
      for (let o = 1; o <= 7; o++) { const d = new Date(); d.setDate(d.getDate() + o); dates.push(localDateStr(d)); }   // tomorrow … a week ahead
      const entries = await Promise.all(dates.map(d => NtApi.getDiaryDate(d).catch(() => null)));
      const input = dates.map((date, i) => {
        const items = (entries[i] && entries[i].items) || [];
        const cal = goalFor(date, 'calories', calorieGoal);
        const prot = goalFor(date, 'proteins', proteinGoal);
        const t = dayTotals(items);
        return { date, items, meals: names.map((name, idx) => ({ idx, name, hasItems: items.some(it => (Number(it.meal) || 0) === idx) })),
          remaining: { calories: cal != null ? cal - t.calories : NaN, protein: prot != null ? prot - t.proteins : NaN } };
      });
      const planned = planWeek({ days: input, limits, prefs: $foodPrefs, saved, dishes, muted: $mutedSuggestionFoods || [], seed });
      days = input.map((d, i) => ({ ...d, label: dayLabel(d.date), plan: planned[i].plan }));
    } catch (e) { showError(e?.message || 'Could not plan the week'); days = []; }
    loading = false;
  }

  // Shuffle one day (a fresh seed for it, still not repeating the day before).
  function shuffleDay(i) {
    const d = days[i];
    const prev = i > 0 ? (days[i - 1].plan.meals || []).flatMap(m => m.items.map(x => x.food.name)) : [];
    const plan = planDay({ meals: d.meals, remaining: d.remaining, limits, prefs: $foodPrefs, saved, dishes, muted: $mutedSuggestionFoods || [],
      seed: 100 + Math.floor(Math.random() * 900), usedNames: prev });
    days = days.map((x, n) => n === i ? { ...x, plan } : x);
  }

  const toggle = (date) => { const n = new Set(expanded); n.has(date) ? n.delete(date) : n.add(date); expanded = n; };
  $: usable = days.filter(d => d.plan && d.plan.meals && d.plan.meals.length);
  $: needsGoal = days.length > 0 && days.every(d => d.plan && d.plan.needsGoal);

  async function addWeek() {
    if (busy || !usable.length) return;
    busy = true;
    const added = [];                                         // { date, item }
    try {
      for (const d of usable) for (const r of planToDiaryRows(d.plan)) {
        const { item } = await addSuggestedFood(r.food, { meal: r.meal, date: d.date, saved, quantity: r.quantity });
        added.push({ date: d.date, item });
      }
      showUndo(`Added ${usable.length} planned day${usable.length === 1 ? '' : 's'} to your diary`, async () => { for (const a of added) await undoAdd(a.date, a.item); });
      open = false;
    } catch (e) {
      showError(e?.message || 'Could not add everything');
      if (added.length) showUndo(`Added ${added.length} items before it stopped`, async () => { for (const a of added) await undoAdd(a.date, a.item); });
    }
    busy = false;
  }

  function weekToList() {
    const rows = usable.flatMap(d => planToDiaryRows(d.plan)).map(r => ({ name: r.food.name, quantity: r.quantity, portion: r.food.portion, unit: r.food.unit }));
    shoppingList.set(mergeShopping($shoppingList || [], itemsToShopping(rows)));
    showSuccess('Added the week to your shopping list');
    showList = true;
  }
</script>

<Sheet bind:open title="Plan my week">
  <div class="wp" data-testid="week-plan">
    {#if loading}
      <p class="wp-sub">Planning the next 7 days…</p>
    {:else if needsGoal}
      <p class="wp-sub">Set a calorie goal on the Goals page and I can plan the week around it.</p>
    {:else}
      <p class="wp-sub">Tomorrow through next week. Days that already have meals logged are only filled where meals are empty.</p>
      {#if hasPrefs($foodPrefs)}<p class="wp-sub">{SAFETY_NOTE}</p>{/if}
      <ul class="wp-days">
        {#each days as d, i (d.date)}
          <li class="wp-day">
            <div class="wp-head">
              <button type="button" class="wp-main" aria-expanded={expanded.has(d.date)} on:click={() => toggle(d.date)}>
                <span class="wp-date">{d.label}</span>
                {#if d.plan.meals && d.plan.meals.length}
                  <span class="wp-sub">{d.plan.totals.calories.toLocaleString()} kcal · {d.plan.totals.proteins} g protein</span>
                {:else}
                  <span class="wp-sub">{d.plan.allFilled ? 'Already planned' : d.plan.full ? 'Nothing left to plan' : 'Nothing to plan'}</span>
                {/if}
                <span class="material-symbols-rounded wp-chev" aria-hidden="true">{expanded.has(d.date) ? 'expand_less' : 'expand_more'}</span>
              </button>
              {#if d.plan.meals && d.plan.meals.length}
                <button type="button" class="wp-shuffle" aria-label="Shuffle {d.label}" on:click={() => shuffleDay(i)}>
                  <span class="material-symbols-rounded" aria-hidden="true">shuffle</span>
                </button>
              {/if}
            </div>
            {#if expanded.has(d.date) && d.plan.meals}
              {#each d.plan.meals as m (m.idx)}
                <div class="wp-meal"><strong>{m.name}</strong>
                  <span class="wp-sub">{m.items.map(it => `${it.quantity} × ${it.food.name}`).join(' · ')}</span>
                </div>
              {/each}
              {#each d.plan.notes || [] as n}<p class="wp-note">{n}</p>{/each}
            {/if}
          </li>
        {/each}
      </ul>
      <div class="wp-actions">
        <button type="button" class="btn btn-primary w-full" disabled={busy || !usable.length} on:click={addWeek} data-testid="week-add">Add the week to my diary</button>
        <div class="wp-row2">
          <button type="button" class="btn btn-secondary" on:click={() => (seed += 1)} data-testid="week-shuffle">
            <span class="material-symbols-rounded" style="font-size:18px" aria-hidden="true">shuffle</span> Shuffle all
          </button>
          <button type="button" class="btn btn-secondary" disabled={!usable.length} on:click={weekToList} data-testid="week-to-list">
            <span class="material-symbols-rounded" style="font-size:18px" aria-hidden="true">shopping_cart</span> Shopping list
          </button>
        </div>
      </div>
    {/if}
  </div>
</Sheet>
<ShoppingListSheet bind:open={showList} />

<style>
  .wp { display: flex; flex-direction: column; gap: 8px; padding-bottom: 6px; }
  .wp-sub { margin: 0; font-size: 12.5px; line-height: 1.4; color: var(--text-3); }
  .wp-days { list-style: none; margin: 4px 0 0; padding: 0; }
  .wp-day { border-bottom: 1px solid var(--border); }
  .wp-day:last-child { border-bottom: 0; }
  .wp-head { display: flex; align-items: center; }
  .wp-main { flex: 1; min-width: 0; min-height: 56px; display: flex; align-items: center; gap: 10px; padding: 6px 0; background: none; border: 0; text-align: left; color: var(--text-1); font: inherit; cursor: pointer; }
  .wp-date { font-size: 15px; font-weight: 600; min-width: 96px; }
  .wp-main .wp-sub { flex: 1; }
  .wp-chev { color: var(--text-3); }
  .wp-shuffle { width: 44px; height: 44px; flex-shrink: 0; border: 0; background: none; color: var(--accent); cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .wp-meal { display: flex; flex-direction: column; gap: 2px; padding: 4px 0 8px 4px; font-size: 14px; }
  .wp-note { margin: 0 0 8px 4px; font-size: 13px; color: #eab308; }
  .wp-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
  .wp-row2 { display: flex; gap: 8px; }
  .wp-row2 .btn { flex: 1; }
</style>
