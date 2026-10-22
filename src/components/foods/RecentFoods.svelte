<!--
  RecentFoods (fork): "Recent" and "Frequent" foods at the top of Foods
  search, shown before anything is typed. Built from the usage counters the
  app already keeps on saved foods (last_used_at / usage_count), so it works
  offline and needs no extra request.

  Row tap → `pick` (open the saved food).  "+" → `add` (log it in one tap).
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { amountAndUnit } from '../../lib/units.js';
  import { recentAndFrequent } from '../../lib/recent-foods.js';
  import FoodIcon from '../ui/FoodIcon.svelte';
  import FoodQuickRow from './FoodQuickRow.svelte';
  export let foods = [];
  export let limit = 4;
  const dispatch = createEventDispatcher();
  $: groups = recentAndFrequent(foods, limit);
  const kcal = (f) => Math.round(f.nutrition?.calories || 0);
  const meta = (f, label) => `${amountAndUnit(f.portion || 100, f.unit)} · ${kcal(f)} kcal${label === 'Frequent' ? ` · ${f.usage_count}×` : ''}`;
</script>

{#if groups.recent.length || groups.frequent.length}
  <section class="rf" data-testid="recent-foods">
    {#each [['Recent', 'history', groups.recent], ['Frequent', 'repeat', groups.frequent]] as [label, icon, rows]}
      {#if rows.length}
        <div class="rf-head">
          <span class="material-symbols-rounded" aria-hidden="true">{icon}</span>{label}
        </div>
        <ul class="rf-list card">
          {#each rows as f (f.id ?? f.name)}
            <FoodQuickRow title={f.name} meta={meta(f, label)} imgUrl={f.imgUrl} testid="recent-food-row"
              on:open={() => dispatch('pick', f)} on:add={() => dispatch('add', f)}>
              <FoodIcon slot="thumb" name={f.name} icon={f.icon} brand={f.brand} emoji={f.emoji} offCategories={f.offCategories} size={26} />
            </FoodQuickRow>
          {/each}
        </ul>
      {/if}
    {/each}
  </section>
{/if}

<style>
  .rf { margin-bottom: 12px; }
  .rf-head { display: flex; align-items: center; gap: 6px; padding: 6px 16px 6px; font-size: 12px; font-weight: 700;
             letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); }
  .rf-head .material-symbols-rounded { font-size: 16px; color: var(--accent); }
  .rf-list { margin: 0 0 10px; padding: 0; list-style: none; overflow: hidden; }
</style>
