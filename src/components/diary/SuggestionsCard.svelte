<!--
  SuggestionsCard (fork): proactive ideas for the day on screen.

    • Drink swap: "Coca-Cola → Zero-sugar soda · saves 140 kcal, 39 g sugar"
    • Protein gap: "38 g protein to go" with a few foods that fit the calories left
    • Planning: on a future day, the same help before anything is logged

  Everything is one tap to act on and one tap to hide for the day. Nothing here
  changes the diary until a button is pressed. Switch it all off in
  Settings → Diary → Smart Suggestions. Rules live in lib/suggestions.js.
-->
<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { NtApi } from '../../lib/api.js';
  import { localDateStr } from '../../lib/db.js';
  import { COMMON_FOODS, commonFoodToFood } from '../../lib/common-foods.js';
  import { suggestForDay, mealForSuggestion } from '../../lib/suggestions.js';
  import { defaultMealForNow } from '../../lib/quick-add.js';
  import { addDiaryItem, removeDiaryItem, currentEntry } from '../../stores/diary.js';
  import { smartSuggestions, suggestSwaps, suggestProtein, dismissedSuggestions, mealNames } from '../../stores/settings.js';
  import { showSuccess, showError } from '../../stores/toast.js';
  import FoodIcon from '../ui/FoodIcon.svelte';

  export let date = '';
  export let items = [];
  export let completed = false;
  export let calorieGoal = null;
  export let proteinGoal = null;

  let saved = [];
  let busy = '';
  let open = true;
  const common = COMMON_FOODS.map(e => commonFoodToFood(e));

  onMount(async () => {
    try { saved = await NtApi.getFoods(); } catch { saved = []; }
  });

  $: today = localDateStr();
  $: dismissedToday = ($dismissedSuggestions || {})[date] || [];
  $: s = $smartSuggestions
    ? suggestForDay({
        date, today, items, completed, proteinGoal, calorieGoal, saved, common,
        enabled: { swaps: $suggestSwaps, protein: $suggestProtein }, dismissed: dismissedToday,
      })
    : { state: 'past', swaps: [], protein: null, planning: false };
  $: count = s.swaps.length + (s.protein ? 1 : 0);
  $: names = $mealNames || ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

  function dismiss(id) {
    const all = { ...($dismissedSuggestions || {}) };
    all[date] = [...(all[date] || []), id];
    // keep two weeks of dismissals, no more
    const keep = Object.keys(all).sort().slice(-14);
    dismissedSuggestions.set(Object.fromEntries(keep.map(k => [k, all[k]])));
  }

  async function swap(sw) {
    if (busy) return;
    busy = sw.id;
    try {
      const meal = Number(sw.from.meal) || 0;
      const { id: _i, uuid: _u, _source, icon: _ic, quantity: _q, ...rest } = sw.to;
      let food = sw.to;
      if (!food.id || typeof food.id !== 'number') {
        // A built-in swap is saved once so it can be edited and reused like any food.
        const existing = saved.find(f => f.name === sw.to.name && !f.deleted_at);
        food = existing ? { ...existing, quantity: sw.to.quantity } : { ...(await NtApi.createFood(rest)), quantity: sw.to.quantity };
        if (!existing) saved = [...saved, food];
      }
      await addDiaryItem({ ...food, portion: food.portion || 1, unit: food.unit || 'serving', quantity: sw.to.quantity, nutrition: food.nutrition }, meal, date);
      // Remove the original by its id, never by position: the list just changed.
      const latest = get(currentEntry);
      const idx = (latest?.items || []).findIndex(i => sw.from.uuid ? i.uuid === sw.from.uuid : i.name === sw.from.name);
      if (idx >= 0) await removeDiaryItem(idx);
      showSuccess(`Swapped to ${sw.to.name}`);
    } catch (e) { showError(e?.message || 'Could not swap that'); }
    busy = '';
  }

  async function addIdea(idea) {
    if (busy) return;
    busy = idea.food.name;
    try {
      const meal = mealForSuggestion({ state: s.state, items, mealCount: names.length, timeMeal: defaultMealForNow(names.length) });
      let food = idea.food;
      if (!food.id || typeof food.id !== 'number') {
        const existing = saved.find(f => f.name === food.name && f.brand === 'USDA' && !f.deleted_at);
        if (existing) food = { ...existing, portion: food.portion, unit: food.unit, nutrition: existing.nutrition };
        else {
          const { id: _d, _source, _commonId, icon: _ic, ...rest } = food;
          food = await NtApi.createFood({ ...rest, created_at: new Date().toISOString() });
          saved = [...saved, food];
        }
      }
      await addDiaryItem({ ...food, portion: food.portion || 100, unit: food.unit || 'g', quantity: 1, nutrition: food.nutrition }, meal, date);
      showSuccess(`Added ${idea.food.name} to ${names[meal] || 'meal'}`);
    } catch (e) { showError(e?.message || 'Could not add that'); }
    busy = '';
  }
</script>

{#if count > 0}
  <section class="card sg" data-testid="suggestions">
    <button type="button" class="sg-head" on:click={() => (open = !open)} aria-expanded={open}>
      <span class="material-symbols-rounded sg-icon" aria-hidden="true">lightbulb</span>
      <span class="sg-title">{s.planning ? 'Plan this day' : 'Suggestions'}</span>
      <span class="sg-count">{count}</span>
      <span class="material-symbols-rounded sg-chev" aria-hidden="true">{open ? 'expand_less' : 'expand_more'}</span>
    </button>

    {#if open}
      {#each s.swaps as sw (sw.id)}
        <div class="sg-item" data-testid="suggestion-swap">
          <div class="sg-body">
            <div class="sg-line"><strong>{sw.from.name}</strong> <span class="sg-arrow">→</span> {sw.to.name}</div>
            <div class="sg-sub">Saves {sw.savesKcal} kcal{sw.savesSugar > 0 ? ` and ${sw.savesSugar} g sugar` : ''}{sw.source === 'saved' ? ' · from your foods' : ''}</div>
          </div>
          <button type="button" class="sg-act" disabled={!!busy} on:click={() => swap(sw)} data-testid="swap-btn">Swap</button>
          <button type="button" class="sg-x" aria-label="Hide this suggestion" on:click={() => dismiss(sw.id)}>
            <span class="material-symbols-rounded" aria-hidden="true">close</span>
          </button>
        </div>
      {/each}

      {#if s.protein}
        <div class="sg-item sg-col" data-testid="suggestion-protein">
          <div class="sg-row">
            <div class="sg-body">
              <div class="sg-line"><strong>{s.protein.gap} g protein</strong> {s.planning ? 'to plan for' : 'to go'}</div>
              <div class="sg-sub">{s.protein.tight ? 'Calories are tight, so these are lean picks.' : 'These fit the calories you have left.'}</div>
            </div>
            <button type="button" class="sg-x" aria-label="Hide this suggestion" on:click={() => dismiss(s.protein.id)}>
              <span class="material-symbols-rounded" aria-hidden="true">close</span>
            </button>
          </div>
          <ul class="sg-ideas">
            {#each s.protein.ideas as idea (idea.food.name)}
              <li class="sg-idea">
                <span class="sg-thumb"><FoodIcon name={idea.food.name} icon={idea.food.icon} brand={idea.food.brand} emoji={idea.food.emoji} size={22} /></span>
                <span class="sg-body">
                  <span class="sg-line sg-name">{idea.food.name}</span>
                  <span class="sg-sub">{idea.food.portion} {idea.food.unit} · {idea.protein} g protein · {idea.kcal} kcal{idea.saved ? ' · yours' : ''}</span>
                </span>
                <button type="button" class="sg-add" aria-label="Add {idea.food.name}" disabled={!!busy} on:click={() => addIdea(idea)} data-testid="idea-add">
                  <span class="material-symbols-rounded" aria-hidden="true">add</span>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .sg { margin: 0 0 12px; padding: 0; overflow: hidden; }
  .sg-head { width: 100%; min-height: 48px; display: flex; align-items: center; gap: 10px; padding: 0 14px; background: none; border: 0;
             color: var(--text-1); font: inherit; cursor: pointer; text-align: left; }
  .sg-icon { color: var(--accent); font-size: 20px; }
  .sg-title { font-weight: 700; flex: 1; }
  .sg-count { font-size: 12px; font-weight: 700; min-width: 20px; padding: 1px 7px; text-align: center; border-radius: 999px; background: var(--accent-dim); color: var(--accent); }
  .sg-chev { color: var(--text-3); font-size: 22px; }
  .sg-item { display: flex; align-items: center; gap: 10px; padding: 10px 6px 10px 14px; border-top: 1px solid var(--border); }
  .sg-col { flex-direction: column; align-items: stretch; gap: 6px; }
  .sg-row { display: flex; align-items: center; gap: 10px; }
  .sg-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .sg-line { font-size: 14px; color: var(--text-1); line-height: 1.3; }
  .sg-arrow { color: var(--text-3); }
  .sg-sub { font-size: 12.5px; color: var(--text-3); line-height: 1.35; }
  .sg-act { min-height: 40px; padding: 0 16px; border-radius: 999px; border: 0; cursor: pointer; font-weight: 700; font-size: 14px;
            background: var(--accent-dim); color: var(--accent); margin-left: 4px; }
  .sg-act:disabled, .sg-add:disabled { opacity: .5; }
  .sg-x { width: 40px; height: 40px; flex-shrink: 0; border: 0; background: none; color: var(--text-3); cursor: pointer;
          display: flex; align-items: center; justify-content: center; border-radius: 50%; margin-left: 6px; }
  .sg-x .material-symbols-rounded { font-size: 20px; }
  .sg-ideas { list-style: none; margin: 0; padding: 0; }
  .sg-idea { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 4px 8px 4px 0; border-top: 1px dashed var(--border); }
  .sg-idea:first-child { border-top: 0; }
  .sg-thumb { width: 34px; height: 34px; flex-shrink: 0; border-radius: var(--radius-sm); background: var(--accent-dim); display: flex; align-items: center; justify-content: center; }
  .sg-name { font-weight: 600; }
  .sg-add { width: 44px; height: 44px; flex-shrink: 0; border-radius: 50%; border: 0; cursor: pointer; margin-left: 8px;
            background: var(--accent-dim); color: var(--accent); display: flex; align-items: center; justify-content: center; }
  .sg-add .material-symbols-rounded { font-size: 24px; }
</style>
