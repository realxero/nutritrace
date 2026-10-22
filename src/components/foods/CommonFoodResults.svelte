<!--
  CommonFoodResults (fork): the "Common foods" section at the top of Foods
  search — built-in USDA foods, offline and instant. Each row shows the
  everyday portion ("1 medium · 105 kcal").

  Row tap  → `pick` (open the food).   "+" → `add` (log it in one tap).
  Shows the 3 best matches, with "Show N more" for the rest, so the list
  doesn't push the rest of the results off the screen.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { commonFoodToFood } from '../../lib/common-foods.js';
  import FoodIcon from '../ui/FoodIcon.svelte';
  import FoodQuickRow from './FoodQuickRow.svelte';
  export let entries = [];
  export let initialCount = 3;
  const dispatch = createEventDispatcher();
  let expanded = false;
  $: rows = entries.map(e => ({ e, f: commonFoodToFood(e) }));
  $: visible = expanded ? rows : rows.slice(0, initialCount);
  $: hidden = rows.length - visible.length;
  const meta = (f) => `${f.portion} ${f.unit} · ${Math.round(f.nutrition.calories || 0)} kcal · P ${Math.round(f.nutrition.proteins || 0)} · C ${Math.round(f.nutrition.carbohydrates || 0)} · F ${Math.round(f.nutrition.fat || 0)}`;
</script>

{#if rows.length}
  <section class="cf" data-testid="common-foods">
    <div class="cf-head">
      <span class="material-symbols-rounded" aria-hidden="true">verified</span>
      Common foods <span class="cf-src">USDA</span>
    </div>
    <ul class="cf-list card">
      {#each visible as { e, f } (e.id)}
        <FoodQuickRow title={e.name} meta={meta(f)} testid="common-food-row"
          on:open={() => dispatch('pick', f)} on:add={() => dispatch('add', f)}>
          <FoodIcon slot="thumb" name={e.name} icon={e.icon} size={26} />
        </FoodQuickRow>
      {/each}
    </ul>
    {#if hidden > 0 || expanded && rows.length > initialCount}
      <button type="button" class="cf-more" on:click={() => (expanded = !expanded)}>
        {expanded ? 'Show fewer' : `Show ${hidden} more`}
      </button>
    {/if}
  </section>
{/if}

<style>
  .cf { margin-bottom: 12px; }
  .cf-head { display: flex; align-items: center; gap: 6px; padding: 6px 16px 6px; font-size: 12px; font-weight: 700;
             letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); }
  .cf-head .material-symbols-rounded { font-size: 16px; color: var(--accent); }
  .cf-src { font-weight: 600; color: var(--accent); letter-spacing: .04em; }
  .cf-list { margin: 0; padding: 0; list-style: none; overflow: hidden; }
  .cf-more { display: block; width: 100%; min-height: 44px; background: none; border: 0; color: var(--accent);
             font-weight: 600; font-size: 14px; cursor: pointer; }
</style>
