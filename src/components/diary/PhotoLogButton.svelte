<script>
  // Fork: one-tap photo logging. Camera icon on a meal card → take a photo →
  // AI estimates one serving → food (with the photo) is saved and logged to
  // this meal. A bottom card shows each stage, then the result.
  import { fly, fade } from 'svelte/transition';
  import { portal } from '../../lib/portal.js';
  import { logMealPhoto } from '../../lib/photo-log.js';
  import { aiProvider, envLocks } from '../../stores/settings.js';

  export let mealIdx = 0;
  export let mealName = '';
  export let date;

  let inputEl;
  let state = null;   // null | { stage, preview, result?, error? }

  const PROVIDER_NAMES = { gemini: 'Gemini', claude: 'Claude', openai: 'OpenAI', 'oai-compat': 'your AI' };
  $: aiName = $envLocks?.ai ? 'the AI' : (PROVIDER_NAMES[$aiProvider] || 'the AI');
  $: stageText = !state ? '' : {
    reading:   'Preparing photo…',
    analyzing: `Asking ${aiName} what this is…`,
    saving:    `Logging to ${mealName}…`,
  }[state.stage] || '';
  $: busy = state && !state.result && !state.error;

  function pick() {
    if (busy) return;
    inputEl.value = '';
    inputEl.click();
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    state = { stage: 'reading', preview };
    try {
      const result = await logMealPhoto(file, mealIdx, date, {
        onStage: stage => { state = { ...state, stage }; },
      });
      state = { ...state, result };
      if (!result.estimate.warnings.length) setTimeout(() => { if (state?.result === result) close(); }, 6000);
    } catch (err) {
      state = { ...state, error: err?.message || String(err) };
    }
  }

  function close() {
    if (state?.preview) URL.revokeObjectURL(state.preview);
    state = null;
  }

  const fmt = v => (Math.round((v || 0) * 10) / 10).toLocaleString();
</script>

<input bind:this={inputEl} type="file" accept="image/*" capture="environment" hidden on:change={onFile} />
<button class="btn-icon meal-photo-btn" class:busy on:click={pick}
  aria-label="Log {mealName} from a photo" title="Log from photo">
  <span class="material-symbols-rounded">{busy ? 'hourglass_top' : 'photo_camera'}</span>
</button>

{#if state}
  <div use:portal class="pl-card" role="status" aria-live="polite"
       in:fly={{ y: 40, duration: 180 }} out:fade={{ duration: 150 }}>
    <img class="pl-thumb" src={state.preview} alt="" />
    <div class="pl-body">
      {#if state.error}
        <div class="pl-title err">Couldn't log that photo</div>
        <div class="pl-sub">{state.error}</div>
      {:else if state.result}
        {@const r = state.result}
        <div class="pl-title"><span class="material-symbols-rounded ok">check_circle</span> Logged to {mealName}</div>
        <div class="pl-name">{r.estimate.name}{r.estimate.brand ? ` · ${r.estimate.brand}` : ''}</div>
        <div class="pl-sub">
          {r.estimate.label || `${r.estimate.amount} ${r.estimate.unit}`} · <b>{r.kcal} kcal</b>
          · <span class="p">{fmt(r.estimate.nutrition.proteins)}P</span>
          <span class="c">{fmt(r.estimate.nutrition.carbohydrates)}C</span>
          <span class="f">{fmt(r.estimate.nutrition.fat)}F</span>
        </div>
        {#each r.estimate.warnings as w}<div class="pl-warn">⚠ {w} Tap the entry in your diary to adjust.</div>{/each}
      {:else}
        <div class="pl-title"><span class="pl-spinner"></span> {stageText}</div>
        <div class="pl-steps">
          {#each ['reading', 'analyzing', 'saving'] as s, i}
            <span class="dot" class:on={['reading','analyzing','saving'].indexOf(state.stage) >= i}></span>
          {/each}
        </div>
      {/if}
    </div>
    {#if !busy}
      <button class="btn-icon pl-close" on:click={close} aria-label="Close"><span class="material-symbols-rounded">close</span></button>
    {/if}
  </div>
{/if}

<style>
  .meal-photo-btn.busy { color: var(--accent); }
  .pl-card {
    position: fixed; z-index: 1200;
    left: 12px; right: 12px; bottom: calc(var(--safe-bottom, 0px) + 84px);
    max-width: 520px; margin: 0 auto;
    display: flex; gap: 12px; align-items: flex-start;
    padding: 12px; border-radius: var(--radius-lg, 16px);
    background: var(--surface-2); border: 1px solid var(--border);
    box-shadow: 0 10px 30px rgba(0,0,0,.35); color: var(--text-1);
  }
  .pl-thumb { width: 56px; height: 56px; border-radius: var(--radius-md, 10px); object-fit: cover; flex: none; }
  .pl-body { flex: 1; min-width: 0; }
  .pl-title { display: flex; align-items: center; gap: 6px; font-weight: 600; }
  .pl-title.err { color: #ef4444; }
  .pl-title .ok { color: var(--accent); font-size: 20px; }
  .pl-name { margin-top: 2px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pl-sub { margin-top: 2px; font-size: .85em; color: var(--text-2); }
  .pl-sub .p { color: var(--macro-protein); } .pl-sub .c { color: var(--macro-carbs); } .pl-sub .f { color: var(--macro-fat); }
  .pl-warn { margin-top: 4px; font-size: .8em; color: #f59e0b; }
  .pl-steps { display: flex; gap: 6px; margin-top: 8px; }
  .pl-steps .dot { width: 22px; height: 4px; border-radius: 2px; background: var(--surface-3); transition: background .2s; }
  .pl-steps .dot.on { background: var(--accent); }
  .pl-spinner {
    width: 14px; height: 14px; border-radius: 50%; flex: none;
    border: 2px solid var(--surface-3); border-top-color: var(--accent);
    animation: pl-spin .8s linear infinite;
  }
  @keyframes pl-spin { to { transform: rotate(360deg); } }
  .pl-close { flex: none; margin: -4px -4px 0 0; }
</style>
