<!--
  SuggestionsCard (fork): proactive ideas for the day on screen.

    • Drink swap: "Coca-Cola → Zero-sugar soda · saves 140 kcal, 39 g sugar"
    • Nutrient watch: "Sodium is at 112% of your limit · Pizza slice → Hamburger, 382 mg less"
    • Protein / fiber gap: "38 g protein to go" with a few foods that fit the calories left
    • Planning: on a future day, the same help before anything is logged

  Everything is one tap to act on and one tap to hide for the day. Nothing here
  changes the diary until a button is pressed. Switch it all off in
  Settings → Diary → Smart Suggestions. Rules live in lib/suggestions.js and lib/day-suggestions.js.
-->
<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { NtApi } from '../../lib/api.js';
  import { localDateStr } from '../../lib/db.js';
  import { COMMON_FOODS, commonFoodToFood } from '../../lib/common-foods.js';
  import { mealForSuggestion, mutedKey } from '../../lib/suggestions.js';
  import { buildDaySuggestions } from '../../lib/day-suggestions.js';
  import { getProgressData } from '../../lib/progress-data.js';
  import { findPatterns } from '../../lib/patterns.js';
  import { findNudges } from '../../lib/nudges.js';
  import { dayTotals } from '../../lib/suggestions.js';
  import { defaultMealForNow } from '../../lib/quick-add.js';
  import { swapDiaryItem, addSuggestedFood, undoAdd, undoSwap } from '../../lib/suggestion-actions.js';
  import { smartSuggestions, suggestSwaps, suggestProtein, suggestNutrients, watchedNutrients, dismissedSuggestions, mealNames, suggestionLevel, mutedSuggestionFoods, foodPrefs, showPatterns } from '../../stores/settings.js';
  import { showSuccess, showError, showUndo } from '../../stores/toast.js';
  import FoodIcon from '../ui/FoodIcon.svelte';
  import ActionSheet from '../ui/ActionSheet.svelte';

  export let date = '';
  export let items = [];
  export let completed = false;
  export let calorieGoal = null;
  export let proteinGoal = null;
  const dispatch = createEventDispatcher();
  export let limits = {};   // the user's goals for sodium, saturated fat, fat, sugar, fiber

  let saved = [];
  let busy = '';
  let open = true;
  const common = COMMON_FOODS.map(e => commonFoodToFood(e));

  let history = null;
  onMount(async () => {
    try { saved = await NtApi.getFoods(); } catch { saved = []; }
    // The whole diary (a shared, cached copy), for the habits behind the heads-up row.
    if ($showPatterns && $smartSuggestions) { try { history = (await getProgressData()).days; } catch { history = null; } }
  });
  // Rounded so a small change in today's activity-adjusted goal does not re-run the search.
  $: stableGoal = calorieGoal > 0 ? Math.round(calorieGoal / 50) * 50 : 0;
  $: patterns = (history && stableGoal > 0 && $showPatterns && $smartSuggestions) ? findPatterns({ days: history, calorieGoal: stableGoal, limit: 50 }).patterns : [];

  $: today = localDateStr();
  $: dismissedToday = ($dismissedSuggestions || {})[date] || [];
  $: s = $smartSuggestions
    ? buildDaySuggestions({
        date, today, items, completed, proteinGoal, calorieGoal, saved, common, limits,
        enabled: { swaps: $suggestSwaps, protein: $suggestProtein }, dismissed: dismissedToday,
        nutrients: $suggestNutrients, watched: $watchedNutrients || [],
        level: $suggestionLevel, muted: $mutedSuggestionFoods || [], prefs: $foodPrefs,
      })
    : { state: 'past', swaps: [], protein: null, fiber: null, nutrients: [], planning: false };
  // Protein and fiber share one "foods that close the gap" block.
  $: gaps = [
    s.protein && { ...s.protein, nutrient: 'protein', unit: 'g' },
    s.fiber && { ...s.fiber, nutrient: 'fiber', unit: 'g' },
  ].filter(Boolean);
  $: kcalLeft = calorieGoal > 0 ? calorieGoal - dayTotals(items).calories : null;
  $: nudges = ($smartSuggestions && $showPatterns)
    ? findNudges({ patterns, items, date, today, kcalLeft, completed, dismissed: dismissedToday }) : [];
  $: count = s.swaps.length + s.nutrients.length + gaps.length + nudges.length;
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
      const { food, item: added } = await swapDiaryItem(sw.from, sw.to, { date, saved, quantity: sw.to.quantity });
      if (food && !saved.some(f => f.id === food.id)) saved = [...saved, food];
      showUndo(`Swapped to ${sw.to.name}`, () => undoSwap(date, sw.from, added));
    } catch (e) { showError(e?.message || 'Could not swap that'); }
    busy = '';
  }

  async function addIdea(idea) {
    if (busy) return;
    busy = idea.food.name;
    try {
      const meal = mealForSuggestion({ state: s.state, items, mealCount: names.length, timeMeal: defaultMealForNow(names.length) });
      const { food, item: added } = await addSuggestedFood(idea.food, { meal, date, saved, quantity: idea.factor || 1 });
      if (food && !saved.some(f => f.id === food.id)) saved = [...saved, food];
      showUndo(`Added ${idea.food.name} to ${names[meal] || 'meal'}`, () => undoAdd(date, added));
    } catch (e) { showError(e?.message || 'Could not add that'); }
    busy = '';
  }

  // The X opens a small menu: hide for today, or never suggest for a food.
  let menuOpen = false;
  let menu = null;      // { id, label, actions:[{label,icon,value}] }
  function openMenu(kind, payload) {
    if (kind !== 'gap') {
      menu = { id: payload.id, title: payload.from.name, actions: [
        { label: 'Hide for today', icon: 'visibility_off', value: 'hide' },
        { label: `Never suggest changes for ${payload.from.name}`, icon: 'block', value: `mute:${payload.from.name}` },
      ] };
    } else {
      menu = { id: payload.id, title: payload.nutrient === 'fiber' ? 'Fiber ideas' : 'Protein ideas', actions: [
        { label: 'Hide for today', icon: 'visibility_off', value: 'hide' },
        ...payload.ideas.map(i => ({ label: `Never suggest ${i.food.name}`, icon: 'block', value: `mute:${i.food.name}` })),
      ] };
    }
    menuOpen = true;
  }
  function onMenu(e) {
    const v = String(e.detail?.value || '');
    if (!menu) return;
    if (v === 'hide') dismiss(menu.id);
    else if (v.startsWith('mute:')) {
      const name = v.slice(5);
      const have = $mutedSuggestionFoods || [];
      if (!have.some(m => mutedKey(m) === mutedKey(name))) mutedSuggestionFoods.set([...have, name]);
      showSuccess(`Won't suggest ${name}. Change this in Settings → Diary.`);
    }
    menu = null;
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
      {#each nudges as n (n.id)}
        <div class="sg-item" data-testid="suggestion-nudge">
          <span class="material-symbols-rounded sg-nudge-ico" aria-hidden="true">info</span>
          <div class="sg-body">
            <div class="sg-line">{n.text}</div>
            <div class="sg-sub">{n.sub}</div>
          </div>
          <button type="button" class="sg-act" on:click={() => dispatch('plan')} data-testid="nudge-plan">Plan</button>
          <button type="button" class="sg-x" aria-label="Hide this heads-up" on:click={() => dismiss(n.id)}>
            <span class="material-symbols-rounded" aria-hidden="true">close</span>
          </button>
        </div>
      {/each}
      {#if s.planning}
        <div class="sg-item">
          <div class="sg-body"><div class="sg-line">Nothing planned yet</div><div class="sg-sub">Build a whole day around your goals, with swaps for anything you don't fancy.</div></div>
          <button type="button" class="sg-act" on:click={() => dispatch('plan')} data-testid="card-plan-day">Plan it</button>
        </div>
      {/if}
      {#each s.swaps as sw (sw.id)}
        <div class="sg-item" data-testid="suggestion-swap">
          <div class="sg-body">
            <div class="sg-line"><strong>{sw.from.name}</strong> <span class="sg-arrow">→</span> {sw.to.name}</div>
            <div class="sg-sub">Saves {sw.savesKcal} kcal{sw.savesSugar > 0 ? ` and ${sw.savesSugar} g sugar` : ''}{sw.source === 'saved' ? ' · from your foods' : ''}</div>
          </div>
          <button type="button" class="sg-act" disabled={!!busy} on:click={() => swap(sw)} data-testid="swap-btn">Swap</button>
          <button type="button" class="sg-x" aria-label="Hide or stop this suggestion" on:click={() => openMenu('swap', sw)}>
            <span class="material-symbols-rounded" aria-hidden="true">close</span>
          </button>
        </div>
      {/each}

      {#each s.nutrients as n (n.id)}
        <div class="sg-item" data-testid="suggestion-nutrient">
          <div class="sg-body">
            <div class="sg-line"><strong>{n.label}</strong> is at {Math.round(n.ratio * 100)}% of your {n.limitSource === 'goal' ? 'goal' : 'daily limit'}</div>
            <div class="sg-sub">{n.from.name} <span class="sg-arrow">→</span> {n.to.name} · {n.why}</div>
          </div>
          <button type="button" class="sg-act" disabled={!!busy} on:click={() => swap(n)} data-testid="swap-btn">Swap</button>
          <button type="button" class="sg-x" aria-label="Hide or stop this suggestion" on:click={() => openMenu('swap', n)}>
            <span class="material-symbols-rounded" aria-hidden="true">close</span>
          </button>
        </div>
      {/each}

      {#each gaps as g (g.id)}
        <div class="sg-item sg-col" data-testid="suggestion-{g.nutrient}">
          <div class="sg-row">
            <div class="sg-body">
              <div class="sg-line"><strong>{g.gap} {g.unit} {g.nutrient}</strong> {s.planning ? 'to plan for' : 'to go'}</div>
              <div class="sg-sub">{g.tight ? 'Calories are tight, so these are lean picks.' : 'These fit the calories you have left.'}</div>
            </div>
            <button type="button" class="sg-x" aria-label="Hide or stop this suggestion" on:click={() => openMenu('gap', g)}>
              <span class="material-symbols-rounded" aria-hidden="true">close</span>
            </button>
          </div>
          <ul class="sg-ideas">
            {#each g.ideas as idea (idea.food.name)}
              <li class="sg-idea">
                <span class="sg-thumb"><FoodIcon name={idea.food.name} icon={idea.food.icon} brand={idea.food.brand} emoji={idea.food.emoji} size={22} /></span>
                <span class="sg-body">
                  <span class="sg-line sg-name">{idea.food.name}{#if idea.food.brand && idea.food.brand !== 'USDA'}<span class="sg-brand"> · {idea.food.brand}</span>{/if}</span>
                  <span class="sg-sub">{idea.servingText || `${idea.food.portion} ${idea.food.unit}`} · {idea.amount} g {g.nutrient} · {idea.kcal} kcal{idea.saved ? (idea.uses >= 2 ? ' · you log it often' : ' · from your foods') : ''}</span>
                </span>
                <button type="button" class="sg-add" aria-label="Add {idea.food.name}" disabled={!!busy} on:click={() => addIdea(idea)} data-testid="idea-add">
                  <span class="material-symbols-rounded" aria-hidden="true">add</span>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    {/if}
  </section>
{/if}

<ActionSheet bind:open={menuOpen} title={menu?.title || ''} actions={menu?.actions || []} on:select={onMenu} />

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
  .sg-nudge-ico { color: #eab308; font-size: 20px; margin-right: -2px; }
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
  .sg-brand { font-weight: 400; color: var(--text-3); }
  .sg-add { width: 44px; height: 44px; flex-shrink: 0; border-radius: 50%; border: 0; cursor: pointer; margin-left: 8px;
            background: var(--accent-dim); color: var(--accent); display: flex; align-items: center; justify-content: center; }
  .sg-add .material-symbols-rounded { font-size: 24px; }
</style>
