<!--
  FoodQuickRow (fork): one row in the Common / Recent / Frequent lists.

  Two separate tap targets so a stray tap can't log anything:
    - the row opens the food (details), 60px tall, whole width
    - the round "+" on the right logs it in one tap (44px, with a gap
      between it and the row)
  Self-contained styles: the Foods page styles (.food-list, .food-item-btn)
  are scoped to that page and don't reach child components, which is why
  these rows used to show bullets and blue link text.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  export let title = '';
  export let meta = '';
  export let imgUrl = '';
  export let addLabel = 'Add to diary';
  export let testid = 'food-quick-row';
  const dispatch = createEventDispatcher();
</script>

<li class="qr" data-testid={testid}>
  <button type="button" class="qr-main" on:click={() => dispatch('open')}>
    <span class="qr-thumb">
      {#if imgUrl}
        <img src={imgUrl} alt="" loading="lazy" referrerpolicy="no-referrer" on:error={(e) => (e.currentTarget.style.display = 'none')} />
      {:else}
        <slot name="thumb" />
      {/if}
    </span>
    <span class="qr-info">
      <span class="qr-name">{title}</span>
      <span class="qr-meta">{meta}</span>
    </span>
  </button>
  <button type="button" class="qr-add" aria-label="{addLabel}: {title}" title={addLabel}
    on:click|stopPropagation={() => dispatch('add')} data-testid="quick-add">
    <span class="material-symbols-rounded" aria-hidden="true">add</span>
  </button>
</li>

<style>
  .qr { list-style: none; display: flex; align-items: center; gap: 12px; min-height: 60px;
        padding-right: 10px; border-bottom: 1px solid var(--border); }
  .qr:last-child { border-bottom: 0; }
  .qr-main { flex: 1; min-width: 0; min-height: 60px; display: flex; align-items: center; gap: 12px;
             padding: 8px 0 8px 14px; background: none; border: 0; text-align: left; cursor: pointer;
             color: var(--text-1); font: inherit; -webkit-tap-highlight-color: transparent;
             -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  .qr-main:active { background: var(--surface-2); }
  .qr-thumb { width: 40px; height: 40px; flex-shrink: 0; border-radius: var(--radius-sm);
              background: var(--accent-dim); display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .qr-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .qr-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .qr-name { font-size: 15px; font-weight: 600; color: var(--text-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qr-meta { font-size: 12.5px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qr-add { width: 44px; height: 44px; flex-shrink: 0; border-radius: 50%; border: 0; cursor: pointer;
            background: var(--accent-dim); color: var(--accent); display: flex; align-items: center; justify-content: center;
            transition: transform var(--dur-fast), background var(--dur-fast); }
  .qr-add:active { transform: scale(.92); background: var(--accent); color: var(--bg, #fff); }
  .qr-add .material-symbols-rounded { font-size: 24px; }
</style>
