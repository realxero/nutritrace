<!--
  BetterOptionSheet (fork): "a better option for my goal" for ONE logged food.

  Opened from the diary (long-press menu, or the edit sheet). It answers even
  when Smart Suggestions are switched off, because the user asked.

    1. Instant options from the built-in foods and your own (same kind of food,
       fitting the goal: lose / gain / protein / balanced; tap a chip to change it).
    2. "Find real products with Trace": the AI looks for real, buyable
       alternatives, using your own AI key. Only runs when pressed.
    3. "Never suggest for this food" adds it to the never-suggest list.

  Nothing changes in the diary until Swap is pressed.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { NtApi } from '../../lib/api.js';
  import { DB } from '../../lib/db.js';
  import Sheet from '../ui/Sheet.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import RestaurantOptions from './RestaurantOptions.svelte';
  import FoodIcon from '../ui/FoodIcon.svelte';
  import { dayTotals, itemTotals, mutedKey } from '../../lib/suggestions.js';
  import { findBetterOptions, goalFocus, FOCUS_LABEL } from '../../lib/better-options.js';
  import { limitFor, WATCH } from '../../lib/day-suggestions.js';
  import { askForAlternatives, traceQuestion } from '../../lib/ai-alternatives.js';
  import { swapDiaryItem, undoSwap } from '../../lib/suggestion-actions.js';
  import { aiEffectivelyEnabled, photoLogWebSearch, targetWeightKg, mutedSuggestionFoods } from '../../stores/settings.js';
  import { showSuccess, showError, showUndo } from '../../stores/toast.js';

  export let open = false;
  export let item = null;
  export let items = [];
  export let date = '';
  export let calorieGoal = null;
  export let proteinGoal = null;
  export let limits = {};

  const dispatch = createEventDispatcher();
  const FOCI = [['lose', 'Lose'], ['gain', 'Gain'], ['protein', 'Protein'], ['sodium', 'Sodium'], ['fat', 'Fat'], ['saturated-fat', 'Sat. fat'], ['sugars', 'Sugar'], ['fiber', 'Fiber'], ['balanced', 'Overall']];

  let saved = [];
  let adaptive = null;
  let focusPick = '';          // user's own choice, overrides the automatic one
  let ai = { state: 'idle', list: [], error: '' };   // idle | loading | done | error
  let busy = '';
  let loadedFor = null;
  let showResto = false;

  // Load what the options need once per opening.
  $: if (open && item && loadedFor !== item) {
    loadedFor = item;
    focusPick = '';
    showResto = false;
    ai = { state: 'idle', list: [], error: '' };
    (async () => {
      try { saved = await NtApi.getFoods(); } catch { saved = []; }
      try { adaptive = await NtApi.get('/api/goals/adaptive-tdee'); } catch { adaptive = null; }
    })();
  }
  $: if (!open) loadedFor = null;

  $: totals = dayTotals(items);
  $: remaining = {
    calories: calorieGoal > 0 ? calorieGoal - totals.calories : NaN,
    protein: proteinGoal > 0 ? proteinGoal - totals.proteins : NaN,
  };
  $: currentKg = adaptive?.trendWeightKg ?? adaptive?.latestWeightKg ?? (Number(DB.getSetting('weight_kg', 0)) || null);
  // A nutrient already past its limit today (sodium, fat, saturated fat, sugar) becomes the default focus.
  $: overNutrient = ['sodium', 'saturated-fat', 'fat', 'sugars'].find(n => {
    const lim = limitFor(n, limits);
    return lim && totals[n] >= lim.value;
  }) || null;
  $: autoFocus = goalFocus({ targetKg: Number($targetWeightKg) || null, currentKg, over: overNutrient, proteinGap: Number.isFinite(remaining.protein) ? remaining.protein : 0 });
  $: focus = focusPick || autoFocus;
  $: focusLabel = FOCUS_LABEL[focus];
  $: focusNutrient = (['sodium', 'fat', 'saturated-fat', 'fiber'].includes(focus) && item)
    ? `${Math.round(cur[focus] * 10) / 10} ${WATCH[focus].unit} ${WATCH[focus].label.toLowerCase()}` : '';
  $: cur = item ? itemTotals(item) : itemTotals(null);
  $: local = item ? findBetterOptions(item, { focus, saved, muted: $mutedSuggestionFoods || [] }) : { kind: 'none', options: [] };
  $: avoid = [...($mutedSuggestionFoods || [])];

  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

  async function findReal() {
    if (ai.state === 'loading' || !item) return;
    ai = { state: 'loading', list: [], error: '' };
    try {
      const list = await askForAlternatives({
        item, focusLabel, remaining, avoid, webSearch: $photoLogWebSearch,
        country: DB.getSetting('offSearchCountry', '') || '',
      });
      ai = { state: 'done', list, error: '' };
    } catch (e) {
      ai = { state: 'error', list: [], error: e?.message || 'Trace could not find options right now.' };
    }
  }

  async function doSwap(food, quantity, label) {
    if (busy || !item) return;
    busy = label;
    try {
      const original = item;
      const { item: added } = await swapDiaryItem(original, food, { date, saved, quantity });
      showUndo(`Swapped to ${food.name}`, () => undoSwap(date, original, added));
      open = false;
    } catch (e) { showError(e?.message || 'Could not swap that'); }
    busy = '';
  }
  const swapLocal = (o) => doSwap(o.food, parseFloat(o.food.quantity) || 1, o.food.name);
  const swapAi = (a) => doSwap({
    name: a.estimate.name, brand: a.estimate.brand, portion: a.estimate.amount, unit: a.estimate.unit,
    nutrition: a.estimate.nutrition, nutrition_basis: a.estimate.unit, categories: [], visibility: 'private',
    notes: [a.estimate.label, a.checked ? '' : 'AI estimate — check the label'].filter(Boolean).join(' · ') || null,
  }, 1, a.estimate.name);

  function neverFor() {
    const name = String(item?.name || '').trim();
    if (!name) return;
    const have = $mutedSuggestionFoods || [];
    if (!have.some(m => mutedKey(m) === mutedKey(name))) mutedSuggestionFoods.set([...have, name]);
    showSuccess(`Won't suggest changes for ${name}`);
    open = false;
  }

  function askInChat() {
    open = false;
    window.dispatchEvent(new CustomEvent('nt:ask-trace', { detail: { text: traceQuestion({ item, focusLabel }) } }));
  }
</script>

<Sheet bind:open title="Better option" on:close={() => dispatch('close')}>
  {#if item}
    <div class="bo" data-testid="better-option-sheet">
      <div class="bo-cur">
        <span class="bo-thumb"><FoodIcon name={item.name} icon={item.icon} brand={item.brand} emoji={item.emoji} size={24} /></span>
        <div class="bo-cur-text">
          <div class="bo-cur-name">{item.name}</div>
          <div class="bo-sub">{Math.round(cur.calories)} kcal · {Math.round(cur.proteins)} g protein{cur.sugars >= 1 ? ` · ${Math.round(cur.sugars)} g sugar` : ''}{focusNutrient ? ` · ${focusNutrient}` : ''}</div>
        </div>
      </div>

      <div class="bo-focus" role="radiogroup" aria-label="What are you aiming for">
        <span class="bo-focus-lab">For</span>
        {#each FOCI as [key, label]}
          <button type="button" role="radio" aria-checked={focus === key} class="bo-chip" class:on={focus === key} on:click={() => (focusPick = key)}>{label}</button>
        {/each}
      </div>
      <p class="bo-sub bo-goal">Looking for options that suit <strong>{focusLabel}</strong>{focusPick ? '' : overNutrient && focus === overNutrient ? ' (it is past its limit today)' : ' (from your goal)'}.</p>

      <h3 class="bo-h">Quick options</h3>
      {#if local.options.length}
        <ul class="bo-list" data-testid="local-options">
          {#each local.options as o (o.food.name)}
            <li class="bo-row">
              <span class="bo-body">
                <span class="bo-name">{o.food.name}{o.source === 'saved' ? ' · yours' : ''}</span>
                <span class="bo-sub">{o.food.portion} {o.food.unit} · {o.why}</span>
              </span>
              <button type="button" class="bo-act" disabled={!!busy} on:click={() => swapLocal(o)} data-testid="swap-local">Swap</button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="bo-sub bo-none">No close match in the built-in foods{local.kind === 'none' ? '' : ' for this goal'}. {$aiEffectivelyEnabled ? 'Trace can look for real products below.' : ''}</p>
      {/if}

      <h3 class="bo-h">Real products from Trace</h3>
      {#if !$aiEffectivelyEnabled}
        <p class="bo-sub">Turn on the AI Assistant in Settings to have Trace look for real products and menu items.</p>
      {:else}
        {#if ai.state === 'idle' || ai.state === 'error'}
          <button type="button" class="btn btn-secondary w-full" on:click={findReal} data-testid="ask-trace-btn">
            <span class="material-symbols-rounded" style="font-size:18px" aria-hidden="true">auto_awesome</span>
            {ai.state === 'error' ? 'Try again' : 'Find real products'}
          </button>
          {#if ai.state === 'error'}<p class="bo-err" role="alert">{ai.error}</p>{/if}
        {:else if ai.state === 'loading'}
          <div class="bo-loading"><Spinner /><span class="bo-sub">Trace is looking…</span></div>
        {:else}
          <ul class="bo-list" data-testid="ai-options">
            {#each ai.list as a (a.estimate.name + (a.estimate.brand || ''))}
              {@const d = { k: Math.round(a.estimate.nutrition.calories - cur.calories), p: Math.round((a.estimate.nutrition.proteins || 0) - cur.proteins) }}
              <li class="bo-row bo-row-ai">
                <span class="bo-body">
                  <span class="bo-name">{a.estimate.name}{a.estimate.brand ? ` · ${a.estimate.brand}` : ''}</span>
                  <span class="bo-sub">{a.estimate.label || `${a.estimate.amount} ${a.estimate.unit}`} · {Math.round(a.estimate.nutrition.calories)} kcal ({sign(d.k)}) · {Math.round(a.estimate.nutrition.proteins || 0)} g protein ({sign(d.p)})</span>
                  {#if a.why}<span class="bo-why">{a.why}</span>{/if}
                  <span class="bo-badge" class:checked={a.checked}>{a.checked ? 'Checked online' : 'Estimate · check the label'}</span>
                </span>
                <button type="button" class="bo-act" disabled={!!busy} on:click={() => swapAi(a)} data-testid="swap-ai">Swap</button>
              </li>
            {/each}
          </ul>
          <button type="button" class="bo-link" on:click={findReal}>Ask again</button>
        {/if}
        <button type="button" class="bo-link" on:click={askInChat} data-testid="ask-in-chat">Ask Trace in the chat instead</button>
      {/if}

      {#if $aiEffectivelyEnabled}
        <h3 class="bo-h">At a restaurant?</h3>
        {#if !showResto}
          <button type="button" class="btn btn-secondary w-full" on:click={() => (showResto = true)} data-testid="open-restaurant">
            <span class="material-symbols-rounded" style="font-size:18px" aria-hidden="true">restaurant_menu</span> Find options on a menu
          </button>
        {:else}
          <RestaurantOptions {items} {date} original={item} focusKey={focus} {calorieGoal} {proteinGoal} {limits} {currentKg}
            restaurantStart={item.brand && item.brand !== 'USDA' ? item.brand : ''} on:done={() => (open = false)} />
        {/if}
      {/if}

      <button type="button" class="bo-never" on:click={neverFor} data-testid="never-for-food">Never suggest changes for {item.name}</button>
    </div>
  {/if}
</Sheet>

<style>
  .bo { display: flex; flex-direction: column; gap: 10px; padding: 4px 0 8px; }
  .bo-cur { display: flex; align-items: center; gap: 12px; }
  .bo-thumb { width: 40px; height: 40px; flex-shrink: 0; border-radius: var(--radius-sm); background: var(--accent-dim); display: flex; align-items: center; justify-content: center; }
  .bo-cur-text { min-width: 0; }
  .bo-cur-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bo-sub { font-size: 12.5px; line-height: 1.35; color: var(--text-3); }
  .bo-goal { margin: -2px 0 0; }
  .bo-goal strong { color: var(--text-2); }
  .bo-focus { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .bo-focus-lab { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); margin-right: 2px; }
  .bo-chip { min-height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border); background: none; color: var(--text-2); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .bo-chip.on { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
  .bo-h { margin: 8px 0 0; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); }
  .bo-list { list-style: none; margin: 0; padding: 0; }
  .bo-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .bo-row:last-child { border-bottom: 0; }
  .bo-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .bo-name { font-size: 15px; font-weight: 600; color: var(--text-1); }
  .bo-why { font-size: 13px; color: var(--text-2); line-height: 1.35; }
  .bo-badge { align-self: flex-start; margin-top: 3px; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--surface-2); color: var(--text-3); }
  .bo-badge.checked { background: var(--accent-dim); color: var(--accent); }
  .bo-act { min-height: 44px; min-width: 72px; padding: 0 16px; border-radius: 999px; border: 0; cursor: pointer; font-weight: 700; font-size: 14px; background: var(--accent-dim); color: var(--accent); }
  .bo-act:disabled { opacity: .5; }
  .bo-none { margin: 0; }
  .bo-loading { display: flex; align-items: center; gap: 10px; padding: 8px 0; }
  .bo-err { margin: 6px 0 0; font-size: 13px; color: #eab308; }
  .bo-link { align-self: flex-start; min-height: 40px; background: none; border: 0; color: var(--accent); font: inherit; font-weight: 600; cursor: pointer; padding: 0; }
  .bo-never { margin-top: 6px; min-height: 44px; background: none; border: 0; color: var(--text-3); font: inherit; font-size: 13px; cursor: pointer; text-align: center; }
</style>
