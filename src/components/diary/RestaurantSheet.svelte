<!--
  RestaurantSheet (fork): plan a restaurant meal from a Diary meal's menu
  ("Eating out…"). Works for today and for days ahead. The picked item is added to
  that meal with an Undo toast. All the work is in RestaurantOptions.
-->
<script>
  import { NtApi } from '../../lib/api.js';
  import { DB } from '../../lib/db.js';
  import Sheet from '../ui/Sheet.svelte';
  import RestaurantOptions from './RestaurantOptions.svelte';

  export let open = false;
  export let meal = null;
  export let items = [];
  export let date = '';
  export let calorieGoal = null;
  export let proteinGoal = null;
  export let limits = {};

  let currentKg = null;
  let loadedOpen = false;
  $: if (open && !loadedOpen) {
    loadedOpen = true;
    (async () => {
      let a = null;
      try { a = await NtApi.get('/api/goals/adaptive-tdee'); } catch { /* the profile weight is enough */ }
      currentKg = a?.trendWeightKg ?? a?.latestWeightKg ?? (Number(DB.getSetting('weight_kg', 0)) || null);
    })();
  }
  $: if (!open) loadedOpen = false;
</script>

<Sheet bind:open title="Eating out">
  {#if open}
    <RestaurantOptions {items} {date} {meal} {calorieGoal} {proteinGoal} {limits} {currentKg} on:done={() => (open = false)} />
  {/if}
</Sheet>
