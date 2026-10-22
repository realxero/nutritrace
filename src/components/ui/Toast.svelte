<script>
  import { fly, fade } from 'svelte/transition';
  import { toasts, dismissToast } from '../../stores/toast.js';
  async function runAction(t) { dismissToast(t.id); try { await t.action.onClick(); } catch (e) { console.warn('[toast] action failed', e); } }
</script>

<div class="toast-container" aria-live="polite">
  {#each $toasts as toast (toast.id)}
    <div
      class="toast toast--{toast.type}"
      in:fly={{ y: 20, duration: 240 }}
      out:fade={{ duration: 160 }}
    >
      {#if toast.type === 'success'}
        <span class="material-symbols-rounded toast-icon">check_circle</span>
      {:else if toast.type === 'error'}
        <span class="material-symbols-rounded toast-icon">error</span>
      {/if}
      <span class="toast-msg">{toast.message}</span>
      {#if toast.action}
        <button type="button" class="toast-action" on:click={() => runAction(toast)}>{toast.action.label}</button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    bottom: calc(var(--nav-h) + var(--safe-bottom) + 12px);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 200;
    pointer-events: none;
    max-width: calc(100vw - 32px);
    width: max-content; /* fork: with left:50% the auto width was capped at half the screen */
  }
  .toast-action { pointer-events: auto; min-height: 36px; padding: 0 10px; margin: -6px -8px -6px 4px; border: 0; background: none; color: var(--accent); font: inherit; font-weight: 700; cursor: pointer; }
  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 18px;
    border-radius: var(--radius-lg);
    background: var(--surface-3);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-1);
    white-space: normal; /* fork: long errors wrap instead of running off screen */
    max-width: 100%;
    box-sizing: border-box;
    backdrop-filter: var(--backdrop-blur);
    -webkit-backdrop-filter: var(--backdrop-blur);
  }
  .toast--success { border-color: rgba(79,255,176,0.25); }
  .toast--error   { border-color: rgba(255,92,92,0.25); }
  .toast-icon { font-size: 18px; flex-shrink: 0; }
  .toast--success .toast-icon { color: var(--success); }
  .toast--error   .toast-icon { color: var(--danger); }
  .toast-msg { flex: 1; min-width: 0; overflow-wrap: anywhere; line-height: 1.3; }
</style>
