<!--
  RecentFoods (fork): "Recent" and "Frequent" foods at the top of Foods
  search, shown before anything is typed. Built from the usage counters the
  app already keeps on saved foods (last_used_at / usage_count), so it works
  offline and needs no extra request. Tapping a row dispatches `pick` with
  the saved food, same as a tap in the library list.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { amountAndUnit } from '../../lib/units.js';
  import { recentAndFrequent } from '../../lib/recent-foods.js';
  import FoodIcon from '../ui/FoodIcon.svelte';
  export let foods = [];
  export let limit = 6;
  const dispatch = createEventDispatcher();
  $: groups = recentAndFrequent(foods, limit);
  const kcal = (f) => Math.round(f.nutrition?.calories || 0);
</script>

{#if groups.recent.length || groups.frequent.length}
  <section class="recent-foods" data-testid="recent-foods">
    {#each [['Recent', 'history', groups.recent], ['Frequent', 'repeat', groups.frequent]] as [label, icon, rows]}
      {#if rows.length}
        <div class="rf-head">
          <span class="material-symbols-rounded" aria-hidden="true">{icon}</span>{label}
        </div>
        <ul class="food-list">
          {#each rows as f (f.id ?? f.name)}
            <li>
              <button class="food-item-btn rf-row" on:click={() => dispatch('pick', f)} data-testid="recent-food-row">
                {#if f.imgUrl}
                  <img class="food-thumb" src={f.imgUrl} alt="" loading="lazy" referrerpolicy="no-referrer"
                    on:error={e => e.target.style.display = 'none'} />
                {:else}
                  <div class="food-thumb-placeholder rf-thumb">
                    <FoodIcon name={f.name} icon={f.icon} brand={f.brand} emoji={f.emoji} offCategories={f.offCategories} size={26} />
                  </div>
                {/if}
                <div class="food-info">
                  <span class="food-name">{f.name}</span>
                  <span class="food-kcal text-sm">{amountAndUnit(f.portion || 100, f.unit)} · {kcal(f)} kcal{#if label === 'Frequent'} <span class="text-3">· {f.usage_count}×</span>{/if}</span>
                </div>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {/each}
  </section>
{/if}

<style>
  .recent-foods { margin-bottom: 10px; }
  .rf-head { display: flex; align-items: center; gap: 6px; padding: 6px 16px 4px; font-size: 12px; font-weight: 700;
             letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); }
  .rf-head .material-symbols-rounded { font-size: 16px; color: var(--accent); }
  .rf-row { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; }
  .rf-thumb { display: flex; align-items: center; justify-content: center; }
</style>
