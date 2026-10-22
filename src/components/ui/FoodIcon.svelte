<!--
  FoodIcon (fork): an emoji for common foods when there's no photo
  (🍌 banana, 🍕 pizza, ☕ coffee), else the Material icon passed as
  `fallback`. Used by diary rows and food lists.
-->
<script>
  import { foodEmoji } from '../../lib/common-foods.js';
  export let name = '';
  export let icon = '';          // a food's own icon (built-in foods carry one)
  export let fallback = 'restaurant';
  export let size = 22;
  $: emoji = foodEmoji(name, icon);
</script>

{#if emoji}
  <span class="food-emoji" style="font-size:{size}px" aria-hidden="true">{emoji}</span>
{:else}
  <span class="material-symbols-rounded" style="font-size:{Math.round(size * 0.82)}px" aria-hidden="true">{fallback}</span>
{/if}

<style>
  .food-emoji { line-height: 1; display: inline-block; filter: saturate(0.95); }
</style>
