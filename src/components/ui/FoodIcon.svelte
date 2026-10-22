<!--
  FoodIcon (fork): an emoji for a food when there's no photo, else the
  Material icon passed as `fallback`. Used by diary rows and food lists.
  Pass the food's own fields where known: a remembered emoji choice, a
  brand, or Open Food Facts categories decide the emoji before the name does.
-->
<script>
  import { resolveFoodEmoji } from '../../lib/food-emoji.js';
  import { foodOverrides } from '../../stores/settings.js';
  export let name = '';
  export let icon = '';          // a food's own icon (built-in foods carry one)
  export let brand = '';
  export let emoji = '';         // set when the item was logged (from categories)
  export let origName = '';      // name before a rename, for remembered choices
  export let offCategories = null;
  export let fallback = 'restaurant';
  export let size = 22;
  // $foodOverrides is read so a changed choice redraws every icon at once.
  $: shown = ($foodOverrides, resolveFoodEmoji({ name, icon, brand, emoji, origName, offCategories }));
</script>

{#if shown}
  <span class="food-emoji" style="font-size:{size}px" aria-hidden="true">{shown}</span>
{:else}
  <span class="material-symbols-rounded" style="font-size:{Math.round(size * 0.82)}px" aria-hidden="true">{fallback}</span>
{/if}

<style>
  .food-emoji { line-height: 1; display: inline-block; filter: saturate(0.95); }
</style>
