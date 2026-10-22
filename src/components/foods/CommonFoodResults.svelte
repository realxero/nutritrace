<!--
  CommonFoodResults (fork): the "Common foods" section at the top of Foods
  search — built-in USDA foods, offline and instant. Each row shows the
  everyday portion ("1 medium · 105 kcal"); tapping dispatches `pick` with
  an app food ready to add or view.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { commonFoodToFood } from '../../lib/common-foods.js';
  import FoodIcon from '../ui/FoodIcon.svelte';
  export let entries = [];
  const dispatch = createEventDispatcher();
  $: rows = entries.map(e => ({ e, f: commonFoodToFood(e) }));
  const fmt = (f) => `${f.portion} ${f.unit} · ${Math.round(f.nutrition.calories || 0)} kcal`;
  const macros = (f) => `P ${Math.round(f.nutrition.proteins || 0)} · C ${Math.round(f.nutrition.carbohydrates || 0)} · F ${Math.round(f.nutrition.fat || 0)}`;
</script>

{#if rows.length}
  <section class="common-foods" data-testid="common-foods">
    <div class="cf-head">
      <span class="material-symbols-rounded" aria-hidden="true">verified</span>
      Common foods <span class="cf-src">USDA</span>
    </div>
    <ul class="food-list">
      {#each rows as { e, f } (e.id)}
        <li>
          <button class="food-item-btn cf-row" on:click={() => dispatch('pick', f)} data-testid="common-food-row">
            <div class="food-thumb-placeholder cf-thumb"><FoodIcon name={e.name} icon={e.icon} size={26} /></div>
            <div class="food-info">
              <span class="food-name">{e.name}</span>
              <span class="food-meta text-3 text-sm">{fmt(f)} <span class="cf-macros">· {macros(f)}</span></span>
            </div>
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .common-foods { margin-bottom: 10px; }
  .cf-head { display: flex; align-items: center; gap: 6px; padding: 6px 16px 4px; font-size: 12px; font-weight: 700;
             letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); }
  .cf-head .material-symbols-rounded { font-size: 16px; color: var(--accent); }
  .cf-src { font-weight: 600; color: var(--accent); letter-spacing: .04em; }
  .cf-row { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; }
  .cf-thumb { display: flex; align-items: center; justify-content: center; }
  .cf-macros { white-space: nowrap; }
</style>
