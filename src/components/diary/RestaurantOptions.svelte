<!--
  RestaurantOptions (fork): "what should I order here?" through Trace.

  Type a restaurant (or a cuisine) and Trace picks real menu items that fit your
  goal and what is left today, with how to order each one. Only runs when you
  press Find. Items are marked "From the menu" only when the model says it looked
  the nutrition up; otherwise "Estimate · check the menu".

  Two uses: planning/adding a meal (button says Add), or replacing a logged food
  (pass `original`; button says Swap). Both give an Undo toast.
-->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { NtApi } from '../../lib/api.js';
  import { DB } from '../../lib/db.js';
  import Spinner from '../ui/Spinner.svelte';
  import { dayContext, FOCUS_LABEL } from '../../lib/better-options.js';
  import { limitFor } from '../../lib/day-suggestions.js';
  import { askForMenuOptions, menuItemToFood, rememberRestaurant, menuQuestion } from '../../lib/ai-restaurant.js';
  import { addSuggestedFood, swapDiaryItem, undoAdd, undoSwap } from '../../lib/suggestion-actions.js';
  import { mealForSuggestion } from '../../lib/suggestions.js';
  import { defaultMealForNow } from '../../lib/quick-add.js';
  import { localDateStr } from '../../lib/db.js';
  import { aiEffectivelyEnabled, photoLogWebSearch, targetWeightKg, mutedSuggestionFoods, recentRestaurants, mealNames } from '../../stores/settings.js';
  import { showError, showUndo } from '../../stores/toast.js';

  export let items = [];
  export let date = '';
  export let meal = null;              // meal index to add to; null = pick by time of day / emptiest
  export let original = null;          // a logged food to replace (Swap) instead of adding
  export let focusKey = '';            // set by a parent that already shows the goal chips
  export let restaurantStart = '';
  export let calorieGoal = null;
  export let proteinGoal = null;
  export let limits = {};
  export let currentKg = null;

  const dispatch = createEventDispatcher();
  const FOCI = [['lose', 'Lose'], ['gain', 'Gain'], ['protein', 'Protein'], ['sodium', 'Sodium'], ['fat', 'Fat'], ['fiber', 'Fiber'], ['balanced', 'Overall']];

  let restaurant = restaurantStart || '';
  let focusPick = '';
  let state = 'idle';                  // idle | loading | done | error
  let result = null;
  let error = '';
  let busy = '';
  let saved = [];

  onMount(async () => { try { saved = await NtApi.getFoods(); } catch { saved = []; } });

  $: ctx = dayContext({ items, calorieGoal, proteinGoal, targetKg: Number($targetWeightKg) || null, currentKg, limits, limitFor });
  $: focus = focusKey || focusPick || ctx.focus;
  $: focusLabel = FOCUS_LABEL[focus];
  $: names = $mealNames || ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
  $: mealIdx = meal != null ? Number(meal) : mealForSuggestion({
    state: date && date > localDateStr() ? 'future' : 'today', items, mealCount: names.length, timeMeal: defaultMealForNow(names.length) });

  async function find() {
    const name = restaurant.trim();
    if (!name || state === 'loading') return;
    state = 'loading'; error = ''; result = null;
    try {
      result = await askForMenuOptions({
        restaurant: name, focusLabel, remaining: ctx.remaining, replacing: original,
        avoid: $mutedSuggestionFoods || [], webSearch: $photoLogWebSearch,
        country: DB.getSetting('offSearchCountry', '') || '', mealName: names[mealIdx] || '',
      });
      recentRestaurants.set(rememberRestaurant($recentRestaurants, name));
      state = 'done';
    } catch (e) { error = e?.message || 'Trace could not look that up right now.'; state = 'error'; }
  }

  async function choose(it) {
    if (busy) return;
    busy = it.estimate.name;
    try {
      const food = menuItemToFood(it, result?.restaurant || restaurant.trim());
      if (original) {
        const from = original;
        const { item: added } = await swapDiaryItem(from, food, { date, saved, quantity: 1 });
        showUndo(`Swapped to ${food.name}`, () => undoSwap(date, from, added));
      } else {
        const { item: added } = await addSuggestedFood(food, { meal: mealIdx, date, saved, quantity: 1 });
        showUndo(`Added ${food.name} to ${names[mealIdx] || 'meal'}`, () => undoAdd(date, added));
      }
      dispatch('done');
    } catch (e) { showError(e?.message || 'Could not add that'); }
    busy = '';
  }

  const fits = (it) => Number.isFinite(ctx.remaining.calories) && it.estimate.nutrition.calories <= ctx.remaining.calories;
  const kcalDelta = (it) => original ? Math.round(it.estimate.nutrition.calories - (parseFloat(original.nutrition?.calories) || 0) * (parseFloat(original.quantity) || 1)) : null;
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

  function askInChat() {
    window.dispatchEvent(new CustomEvent('nt:ask-trace', { detail: { text: menuQuestion({ restaurant: restaurant.trim(), focusLabel }) } }));
    dispatch('done');
  }
</script>

<div class="ro" data-testid="restaurant-options">
  {#if !$aiEffectivelyEnabled}
    <p class="ro-sub">Turn on the AI Assistant in Settings to have Trace look up restaurant menus.</p>
  {:else}
    {#if !focusKey}
      <div class="ro-focus" role="radiogroup" aria-label="What are you aiming for">
        {#each FOCI as [key, label]}
          <button type="button" role="radio" aria-checked={focus === key} class="ro-chip" class:on={focus === key} on:click={() => (focusPick = key)}>{label}</button>
        {/each}
      </div>
    {/if}
    <form class="ro-form" on:submit|preventDefault={find}>
      <input class="input" type="text" bind:value={restaurant} maxlength="60" placeholder="Restaurant or cuisine, e.g. Chipotle, Thai"
        aria-label="Restaurant or cuisine" data-testid="restaurant-input" />
      <button type="submit" class="btn btn-primary" disabled={!restaurant.trim() || state === 'loading'} data-testid="restaurant-find">Find</button>
    </form>
    {#if ($recentRestaurants || []).length && state !== 'loading'}
      <div class="ro-recent">
        {#each $recentRestaurants as r (r)}
          <button type="button" class="ro-chip" on:click={() => { restaurant = r; find(); }}>{r}</button>
        {/each}
      </div>
    {/if}
    <p class="ro-sub">For {focusLabel}{Number.isFinite(ctx.remaining.calories) ? ` · about ${Math.max(0, Math.round(ctx.remaining.calories))} kcal left today` : ''}.</p>

    {#if state === 'loading'}
      <div class="ro-loading"><Spinner /><span class="ro-sub">Trace is checking the menu…</span></div>
    {:else if state === 'error'}
      <p class="ro-err" role="alert">{error}</p>
    {:else if state === 'done' && result}
      <ul class="ro-list" data-testid="menu-options">
        {#each result.items as it (it.estimate.name)}
          {@const n = it.estimate.nutrition}
          <li class="ro-row">
            <span class="ro-body">
              <span class="ro-name">{it.estimate.name}</span>
              {#if it.order}<span class="ro-order"><strong>Order:</strong> {it.order}</span>{/if}
              <span class="ro-sub">{it.estimate.label || `${it.estimate.amount} ${it.estimate.unit}`} · {Math.round(n.calories)} kcal{kcalDelta(it) != null ? ` (${sign(kcalDelta(it))})` : ''} · {Math.round(n.proteins || 0)} g protein{n.sodium ? ` · ${Math.round(n.sodium)} mg sodium` : ''}</span>
              {#if it.why}<span class="ro-why">{it.why}</span>{/if}
              <span class="ro-badges">
                <span class="ro-badge" class:menu={it.fromMenu}>{it.fromMenu ? 'From the menu' : 'Estimate · check the menu'}</span>
                {#if fits(it)}<span class="ro-badge fit">Fits your calories</span>{/if}
              </span>
            </span>
            <button type="button" class="ro-act" disabled={!!busy} on:click={() => choose(it)} data-testid="menu-choose">{original ? 'Swap' : 'Add'}</button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if restaurant.trim()}
      <button type="button" class="ro-link" on:click={askInChat} data-testid="menu-ask-chat">Ask Trace in the chat instead</button>
    {/if}
  {/if}
</div>

<style>
  .ro { display: flex; flex-direction: column; gap: 10px; }
  .ro-focus, .ro-recent { display: flex; flex-wrap: wrap; gap: 6px; }
  .ro-chip { min-height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border); background: none; color: var(--text-2); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .ro-chip.on { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
  .ro-form { display: flex; gap: 8px; }
  .ro-form .input { flex: 1; min-width: 0; font-size: 16px; }
  .ro-sub { margin: 0; font-size: 12.5px; line-height: 1.35; color: var(--text-3); }
  .ro-loading { display: flex; align-items: center; gap: 10px; padding: 8px 0; }
  .ro-err { margin: 0; font-size: 13px; color: #eab308; }
  .ro-list { list-style: none; margin: 0; padding: 0; }
  .ro-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .ro-row:last-child { border-bottom: 0; }
  .ro-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .ro-name { font-size: 15px; font-weight: 600; color: var(--text-1); }
  .ro-order { font-size: 13px; line-height: 1.35; color: var(--text-2); }
  .ro-why { font-size: 13px; color: var(--text-2); line-height: 1.35; }
  .ro-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
  .ro-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--surface-2); color: var(--text-3); }
  .ro-badge.menu, .ro-badge.fit { background: var(--accent-dim); color: var(--accent); }
  .ro-act { min-height: 44px; min-width: 72px; padding: 0 16px; border-radius: 999px; border: 0; cursor: pointer; font-weight: 700; font-size: 14px; background: var(--accent-dim); color: var(--accent); }
  .ro-act:disabled { opacity: .5; }
  .ro-link { align-self: flex-start; min-height: 40px; background: none; border: 0; color: var(--accent); font: inherit; font-weight: 600; cursor: pointer; padding: 0; }
</style>
