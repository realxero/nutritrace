<!--
  TagListEditor (fork): a small list of words with an add box. Used for the
  allergy / avoid / dislike lists. Tap the x on a chip to remove it.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  export let list = [];
  export let placeholder = 'Add…';
  export let label = '';
  export let max = 40;
  const dispatch = createEventDispatcher();
  let text = '';
  const key = (s) => String(s).toLowerCase().trim();
  function add() {
    const v = text.trim().slice(0, 40);
    if (!v || (list || []).length >= max) return;
    if (!(list || []).some(x => key(x) === key(v))) dispatch('change', [...(list || []), v]);
    text = '';
  }
  const remove = (v) => dispatch('change', (list || []).filter(x => x !== v));
</script>

<div class="tl">
  {#if (list || []).length}
    <ul class="tl-chips">
      {#each list as v (v)}
        <li><span>{v}</span><button type="button" aria-label="Remove {v}" on:click={() => remove(v)}><span class="material-symbols-rounded" aria-hidden="true">close</span></button></li>
      {/each}
    </ul>
  {/if}
  <form class="tl-add" on:submit|preventDefault={add}>
    <input type="text" class="input" {placeholder} bind:value={text} maxlength="40" aria-label={label || placeholder} />
    <button type="submit" class="btn btn-secondary" disabled={!text.trim()}>Add</button>
  </form>
</div>

<style>
  .tl-chips { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .tl-chips li { display: flex; align-items: center; gap: 2px; padding: 4px 4px 4px 12px; border-radius: 999px; background: var(--surface-2); font-size: 14px; }
  .tl-chips button { width: 32px; height: 32px; border: 0; background: none; color: var(--text-3); cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .tl-chips .material-symbols-rounded { font-size: 18px; }
  .tl-add { display: flex; gap: 8px; }
  .tl-add .input { flex: 1; min-width: 0; font-size: 16px; }
</style>
