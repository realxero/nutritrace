<!--
  ShoppingListSheet (fork): the shopping list.

  Items come from a day plan ("Add to shopping list"), from meals you have planned
  on days ahead in the diary (button below), or typed by hand. Same foods are added
  together; items sit in store-aisle order; tick them off in the shop; share the rest
  as text. Saved with your other settings, so it follows you between devices.
-->
<script>
  import { NtApi } from '../../lib/api.js';
  import { localDateStr } from '../../lib/db.js';
  import { isNative } from '../../lib/platform.js';
  import { copyText } from '../../lib/clipboard.js';
  import Sheet from '../ui/Sheet.svelte';
  import { shoppingList } from '../../stores/settings.js';
  import { showSuccess, showError } from '../../stores/toast.js';
  import { itemsToShopping, mergeShopping, addManualItem, toggleItem, removeItem, clearChecked, qtyText, groupByAisle, shoppingToText, remainingCount } from '../../lib/shopping.js';

  export let open = false;

  let text = '';
  let loadingPlanned = false;
  $: list = $shoppingList || [];
  $: groups = groupByAisle(list);
  $: left = remainingCount(list);
  $: anyChecked = list.some(i => i.checked);

  const add = () => { shoppingList.set(addManualItem(list, text)); text = ''; };

  async function addPlanned() {
    if (loadingPlanned) return;
    loadingPlanned = true;
    try {
      const entries = [];
      let days = 0;
      for (let o = 1; o <= 7; o++) {                         // tomorrow … a week ahead
        const d = new Date(); d.setDate(d.getDate() + o);
        const e = await NtApi.getDiaryDate(localDateStr(d)).catch(() => null);
        const items = (e && e.items) || [];
        if (items.length) { days++; entries.push(...items); }
      }
      if (!entries.length) { showError('Nothing is planned in the next 7 days. Plan a day, or log meals on a future date.'); }
      else {
        shoppingList.set(mergeShopping(list, itemsToShopping(entries, { source: 'planned' })));
        showSuccess(`Added meals from ${days} planned day${days === 1 ? '' : 's'}`);
      }
    } catch (e) { showError(e?.message || 'Could not read your planned days'); }
    loadingPlanned = false;
  }

  async function share() {
    const body = shoppingToText(list);
    try {
      if (isNative) {
        const { Share } = await import('@capacitor/share');
        await Share.share({ title: 'Shopping list', text: body, dialogTitle: 'Share shopping list' });
      } else if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Shopping list', text: body });
      } else {
        await copyText(body); showSuccess('Copied the list');
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;                // the user closed the share sheet
      try { await copyText(body); showSuccess('Copied the list'); } catch { showError('Could not share or copy the list'); }
    }
  }
</script>

<Sheet bind:open title="Shopping list">
  <div class="sl" data-testid="shopping-list">
    <form class="sl-add" on:submit|preventDefault={add}>
      <input class="input" type="text" bind:value={text} maxlength="80" placeholder="Add an item" aria-label="Add an item" data-testid="shopping-input" />
      <button type="submit" class="btn btn-secondary" disabled={!text.trim()}>Add</button>
    </form>

    {#if !list.length}
      <p class="sl-empty">Your list is empty. Plan a day and tap <strong>Add to shopping list</strong>, or add the meals you have planned for the week.</p>
    {:else}
      <p class="sl-count">{left} to get{anyChecked ? ` · ${list.length - left} done` : ''}</p>
      {#each groups as g (g.aisle)}
        <h3 class="sl-aisle">{g.aisle}</h3>
        <ul class="sl-list">
          {#each g.items as it (it.id)}
            <li class="sl-row" class:done={it.checked}>
              <button type="button" class="sl-main" role="checkbox" aria-checked={it.checked} on:click={() => shoppingList.set(toggleItem(list, it.id))} data-testid="shopping-item">
                <span class="sl-box" class:on={it.checked}><span class="material-symbols-rounded" aria-hidden="true">{it.checked ? 'check' : ''}</span></span>
                <span class="sl-name">{it.name}</span>
                {#if qtyText(it)}<span class="sl-qty">{qtyText(it)}</span>{/if}
              </button>
              <button type="button" class="sl-x" aria-label="Remove {it.name}" on:click={() => shoppingList.set(removeItem(list, it.id))}>
                <span class="material-symbols-rounded" aria-hidden="true">close</span>
              </button>
            </li>
          {/each}
        </ul>
      {/each}
    {/if}

    <div class="sl-actions">
      <button type="button" class="btn btn-secondary w-full" disabled={loadingPlanned} on:click={addPlanned} data-testid="shopping-add-planned">
        <span class="material-symbols-rounded" style="font-size:18px" aria-hidden="true">event_upcoming</span>
        {loadingPlanned ? 'Reading your plans…' : 'Add meals planned for the next 7 days'}
      </button>
      {#if list.length}
        <div class="sl-row2">
          <button type="button" class="btn btn-secondary" on:click={share} data-testid="shopping-share">
            <span class="material-symbols-rounded" style="font-size:18px" aria-hidden="true">ios_share</span> Share
          </button>
          <button type="button" class="btn btn-ghost" disabled={!anyChecked} on:click={() => shoppingList.set(clearChecked(list))} data-testid="shopping-clear">Clear checked</button>
        </div>
      {/if}
    </div>
  </div>
</Sheet>

<style>
  .sl { display: flex; flex-direction: column; gap: 6px; padding-bottom: 6px; }
  .sl-add { display: flex; gap: 8px; }
  .sl-add .input { flex: 1; min-width: 0; font-size: 16px; }
  .sl-empty { margin: 14px 0 6px; font-size: 14px; line-height: 1.45; color: var(--text-3); }
  .sl-count { margin: 6px 0 0; font-size: 12.5px; color: var(--text-3); }
  .sl-aisle { margin: 12px 0 0; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); }
  .sl-list { list-style: none; margin: 0; padding: 0; }
  .sl-row { display: flex; align-items: center; border-bottom: 1px solid var(--border); }
  .sl-row:last-child { border-bottom: 0; }
  .sl-main { flex: 1; min-width: 0; min-height: 52px; display: flex; align-items: center; gap: 12px; padding: 6px 0; background: none; border: 0; text-align: left; color: var(--text-1); font: inherit; cursor: pointer; }
  .sl-box { width: 26px; height: 26px; flex-shrink: 0; border-radius: 8px; border: 2px solid var(--border-strong, var(--border)); display: flex; align-items: center; justify-content: center; color: var(--bg, #fff); }
  .sl-box.on { background: var(--accent); border-color: var(--accent); }
  .sl-box .material-symbols-rounded { font-size: 18px; }
  .sl-name { flex: 1; min-width: 0; font-size: 15px; font-weight: 500; }
  .sl-qty { font-size: 13px; color: var(--text-3); white-space: nowrap; }
  .done .sl-name { text-decoration: line-through; color: var(--text-3); }
  .sl-x { width: 44px; height: 44px; flex-shrink: 0; border: 0; background: none; color: var(--text-3); cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .sl-x .material-symbols-rounded { font-size: 20px; }
  .sl-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
  .sl-row2 { display: flex; gap: 8px; }
  .sl-row2 .btn { flex: 1; }
</style>
