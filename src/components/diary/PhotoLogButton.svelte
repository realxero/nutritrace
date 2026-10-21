<script>
  // Fork: photo logging with a quick review step.
  //   tap camera → photo → AI estimate (optionally checked online) →
  //   review card: add a nutrition-label photo, fix any number → Log.
  // On a meal card (mealIdx set) "Log" goes to that meal; from the Foods tab
  // (mealIdx null) the card offers a button per meal.
  import { fly, fade } from 'svelte/transition';
  import { portal } from '../../lib/portal.js';
  import { analyzeMealPhoto, saveEstimatedFood, logPhotoServing, rescaleEstimate, portionOf } from '../../lib/photo-log.js';
  import { aiProvider, envLocks, mealNames, photoLogWebSearch, aiAskWhenUnsure } from '../../stores/settings.js';
  import { localDateStr } from '../../lib/db.js';

  export let mealIdx = null;     // null = Foods tab: choose a meal on the card
  export let mealName = '';
  export let date = null;
  export let variant = 'meal';   // 'meal' (meal-card icon) | 'inline' (search bar)

  let inputEl;
  let addingLabel = false;
  // state: null | { files, previews, stage, estimate?, imageDataUrl?, error?, saving?, done? }
  let state = null;
  let run = 0;                   // newer analysis supersedes older ones
  let form = null;               // editable copy of the estimate
  let whole = null;              // full estimate of a divisible item (pizza, cake…)
  let pieces = null;             // how many pieces the user is eating
  let answers = [];              // [{q, a}] answers to the AI's questions
  let questionDismissed = false;

  const PROVIDER_NAMES = { gemini: 'Gemini', claude: 'Claude', openai: 'OpenAI', 'oai-compat': 'your AI' };
  $: isGemini = !$envLocks?.ai && $aiProvider === 'gemini';
  $: aiName = $envLocks?.ai ? 'the AI' : (PROVIDER_NAMES[$aiProvider] || 'the AI');
  $: stageText = !state ? '' : {
    reading:   'Preparing photo…',
    analyzing: isGemini && $photoLogWebSearch ? `Asking ${aiName} (and checking online)…` : `Asking ${aiName} what this is…`,
  }[state.stage] || '';
  $: busy = !!state && !state.estimate && !state.error;
  $: meals = $mealNames || ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
  const SOURCE_TEXT = { label: 'Read from the label', web: 'Checked online', estimate: 'AI estimate' };

  function pick(label = false) {
    if (busy && !label) return;
    addingLabel = label;
    inputEl.value = '';
    inputEl.click();
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    if (addingLabel && state) {
      state = { ...state, files: [...state.files, file].slice(0, 3), previews: [...state.previews, preview].slice(0, 3) };
    } else {
      cleanup();
      state = { files: [file], previews: [preview], stage: 'reading' };
      answers = []; questionDismissed = false;
    }
    analyze();
  }

  async function analyze() {
    const my = ++run;
    state = { ...state, stage: 'reading', estimate: null, error: null };
    form = null;
    try {
      const { estimate, imageDataUrl } = await analyzeMealPhoto(state.files, {
        webSearch: $photoLogWebSearch,
        askWhenUnsure: $aiAskWhenUnsure,
        answers,
        onStage: stage => { if (my === run) state = { ...state, stage }; },
      });
      if (my !== run) return;
      whole = estimate.divisible ? estimate : null;
      // A dish for the table (turkey, lasagna pan, pot of chili) starts at one
      // person's usual portion; one person's food starts at all of it.
      pieces = whole ? (estimate.shared ? estimate.divisible.typical : estimate.divisible.count) : null;
      const first = whole ? portionOf(estimate, pieces) : estimate;
      state = { ...state, estimate: whole ? { ...first, wholeAmount: estimate.amount } : estimate, imageDataUrl };
      form = {
        name: estimate.name, amount: first.amount, unit: estimate.unit,
        calories: first.nutrition.calories ?? 0, proteins: first.nutrition.proteins ?? 0,
        carbohydrates: first.nutrition.carbohydrates ?? 0, fat: first.nutrition.fat ?? 0,
      };
    } catch (err) {
      if (my === run) state = { ...state, error: err?.message || String(err) };
    }
  }

  // Divisible items: pick how many pieces → everything rescales from the whole.
  function pickPieces(n) {
    if (!whole) return;
    pieces = n;
    const est = portionOf(whole, n);
    state = { ...state, estimate: est };
    form = { ...form, amount: est.amount, calories: est.nutrition.calories, proteins: est.nutrition.proteins,
             carbohydrates: est.nutrition.carbohydrates, fat: est.nutrition.fat };
  }
  // Quick picks: their usual portion, 1–3, half, all (deduped, in order).
  $: pieceChoices = whole ? [...new Set([whole.divisible.typical, 1, 2, 3, whole.divisible.count / 2, whole.divisible.count]
      .filter(n => n > 0 && n <= whole.divisible.count))].sort((a, b) => a - b) : [];
  $: unitOne = whole ? whole.divisible.unit.replace(/s$/, '') : '';
  function unitFor(n) { return n === 1 ? unitOne : unitOne + 's'; }
  function pieceLabel(n) {
    if (n === whole.divisible.count) return 'All';
    if (n * 2 === whole.divisible.count && n > 3) return 'Half';
    return `${n} ${unitFor(n)}`;
  }
  // Step by halves for anything else ("1.5 servings of turkey").
  function stepPieces(d) {
    const next = Math.round(((pieces || 0) + d) * 2) / 2;
    if (next >= 0.5 && next <= whole.divisible.count) pickPieces(next);
  }

  // Ask Me When Unsure: answer → re-check with the answer; skip → keep the guess.
  function answerQuestion(choice) {
    const q = state?.estimate?.question;
    if (!q) return;
    answers = [...answers, { q: q.text, a: choice }];
    analyze();
  }

  // Changing the amount rescales the numbers; typing a number overrides it.
  function onAmount() {
    if (!state?.estimate || !(Number(form.amount) > 0)) return;
    const base = { ...state.estimate, nutrition: { ...state.estimate.nutrition,
      calories: +form.calories, proteins: +form.proteins, carbohydrates: +form.carbohydrates, fat: +form.fat } };
    const prevAmount = state.estimate.amount;
    const r = rescaleEstimate({ ...base, amount: prevAmount }, Number(form.amount));
    state = { ...state, estimate: r };
    form = { ...form, calories: r.nutrition.calories, proteins: r.nutrition.proteins,
             carbohydrates: r.nutrition.carbohydrates, fat: r.nutrition.fat };
  }

  function finalEstimate() {
    const e = state.estimate;
    const num = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
    return {
      ...e,
      name: String(form.name || e.name).trim().slice(0, 60) || e.name,
      amount: num(form.amount) || e.amount,
      unit: form.unit === 'ml' ? 'ml' : 'g',
      nutrition: { ...e.nutrition, calories: num(form.calories), proteins: num(form.proteins),
                   carbohydrates: num(form.carbohydrates), fat: num(form.fat) },
    };
  }

  async function logTo(idx) {
    if (!state?.estimate || state.saving) return;
    state = { ...state, saving: true };
    try {
      const est = finalEstimate();
      const food = await saveEstimatedFood(est, state.imageDataUrl);
      const kcal = idx == null ? Math.round(est.nutrition.calories)
        : await logPhotoServing(food, est, state.imageDataUrl, idx, date || localDateStr());
      state = { ...state, saving: false, done: { kcal, to: idx == null ? null : meals[idx], name: est.name } };
      const s = state;
      setTimeout(() => { if (state === s) close(); }, 2500);
    } catch (err) {
      state = { ...state, saving: false, error: err?.message || String(err) };
    }
  }

  function defaultMealIdx() {
    const h = new Date().getHours();
    return Math.min(h < 10 ? 0 : h < 15 ? 1 : h < 21 ? 2 : 3, meals.length - 1);
  }

  function cleanup() { for (const p of state?.previews || []) URL.revokeObjectURL(p); }
  function close() { run++; cleanup(); state = null; form = null; }
</script>

<input bind:this={inputEl} type="file" accept="image/*" capture="environment" hidden on:change={onFile} data-testid="photo-input" />
{#if variant === 'inline'}
  <button class="btn-scan-inline photo-inline" class:busy on:click={() => pick(false)} aria-label="Add a food from a photo" title="Add from photo">
    <span class="material-symbols-rounded">{busy ? 'hourglass_top' : 'photo_camera'}</span>
  </button>
{:else}
  <button class="btn-icon meal-photo-btn" class:busy on:click={() => pick(false)}
    aria-label="Log {mealName} from a photo" title="Log from photo">
    <span class="material-symbols-rounded">{busy ? 'hourglass_top' : 'photo_camera'}</span>
  </button>
{/if}

{#if state}
  <div use:portal class="pl-card" role="dialog" aria-label="Photo log" data-testid="photo-log-card"
       in:fly={{ y: 40, duration: 180 }} out:fade={{ duration: 150 }}>
    <div class="pl-top">
      <div class="pl-thumbs">
        {#each state.previews as p}<img class="pl-thumb" src={p} alt="" />{/each}
        {#if state.previews.length < 3 && !state.done}
          <button class="pl-add-photo" on:click={() => pick(true)} title="Add a nutrition-label photo" data-testid="photo-add-label">
            <span class="material-symbols-rounded">add_a_photo</span><span>Label</span>
          </button>
        {/if}
      </div>
      <button class="btn-icon pl-close" on:click={close} aria-label="Close"><span class="material-symbols-rounded">close</span></button>
    </div>

    {#if state.done}
      <div class="pl-title"><span class="material-symbols-rounded ok">check_circle</span>
        {state.done.to ? `Logged to ${state.done.to}` : 'Saved to Foods'} · {state.done.kcal} kcal</div>
      <div class="pl-sub">{state.done.name}</div>
    {:else if state.error}
      <div class="pl-title err">Couldn't use that photo</div>
      <div class="pl-sub">{state.error}</div>
      <button class="pl-btn" on:click={analyze}>Try again</button>
    {:else if !state.estimate}
      <div class="pl-title"><span class="pl-spinner"></span> {stageText}</div>
      <div class="pl-sub">Tip: add a photo of the Nutrition Facts for exact numbers.</div>
    {:else if form}
      <div class="pl-source" data-source={state.estimate.source}>
        {SOURCE_TEXT[state.estimate.source] || 'AI estimate'}{state.estimate.confidence === 'low' ? ' · low confidence' : ''}
      </div>
      <input class="pl-name-input" bind:value={form.name} aria-label="Food name" data-testid="pl-name" />
      {#if state.estimate.label}<div class="pl-sub">{state.estimate.label}</div>{/if}
      {#if state.estimate.question && !questionDismissed}
        <div class="pl-question" data-testid="pl-question">
          <div class="pl-q-text">🤔 {state.estimate.question.text}</div>
          <div class="pl-meals">
            {#each state.estimate.question.choices as c}
              <button class="pl-meal" on:click={() => answerQuestion(c)}>{c}</button>
            {/each}
            <button class="pl-meal skip" on:click={() => questionDismissed = true}>Skip, use best guess</button>
          </div>
        </div>
      {/if}
      {#if whole}
        {#if whole.shared}
          <div class="pl-shared" data-testid="pl-shared">Looks like a dish for sharing, so this logs your portion, not the whole thing.</div>
        {/if}
        <div class="pl-log-label">How much are you having? (the whole thing is about {whole.divisible.count} {unitFor(whole.divisible.count)})</div>
        <div class="pl-meals" data-testid="pl-portions">
          {#each pieceChoices as n}
            <button class="pl-meal" class:suggested={pieces === n} on:click={() => pickPieces(n)}>{pieceLabel(n)}</button>
          {/each}
        </div>
        <div class="pl-stepper" data-testid="pl-stepper">
          <button class="pl-meal" aria-label="Less" on:click={() => stepPieces(-0.5)}>−</button>
          <span data-testid="pl-pieces">{pieces} {unitFor(pieces)}</span>
          <button class="pl-meal" aria-label="More" on:click={() => stepPieces(0.5)}>+</button>
        </div>
      {/if}
      <div class="pl-grid">
        <label><span>Amount</span>
          <div class="pl-amt"><input inputmode="decimal" bind:value={form.amount} on:change={onAmount} data-testid="pl-amount" />
            <select bind:value={form.unit}><option value="g">g</option><option value="ml">ml</option></select></div></label>
        <label class="k"><span>kcal</span><input inputmode="decimal" bind:value={form.calories} data-testid="pl-kcal" /></label>
        <label class="p"><span>Protein g</span><input inputmode="decimal" bind:value={form.proteins} data-testid="pl-protein" /></label>
        <label class="c"><span>Carbs g</span><input inputmode="decimal" bind:value={form.carbohydrates} data-testid="pl-carbs" /></label>
        <label class="f"><span>Fat g</span><input inputmode="decimal" bind:value={form.fat} data-testid="pl-fat" /></label>
      </div>
      {#each state.estimate.warnings as w}<div class="pl-warn">⚠ {w}</div>{/each}
      {#if isGemini}
        <label class="pl-check"><input type="checkbox" bind:checked={$photoLogWebSearch} /> Check product online (Gemini search)</label>
      {/if}
      {#if mealIdx != null}
        <button class="pl-btn primary" disabled={state.saving} on:click={() => logTo(mealIdx)} data-testid="pl-log">
          {state.saving ? 'Logging…' : `Log to ${mealName}`}</button>
      {:else}
        <div class="pl-log-label">Log it to:</div>
        <div class="pl-meals">
          {#each meals as m, i}
            <button class="pl-meal" class:suggested={i === defaultMealIdx()} disabled={state.saving} on:click={() => logTo(i)}>{m}</button>
          {/each}
          <button class="pl-meal" disabled={state.saving} on:click={() => logTo(null)}>Just save</button>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .meal-photo-btn.busy, .photo-inline.busy { color: var(--accent); }
  .photo-inline { right: 41px; }
  .pl-card {
    position: fixed; z-index: 1200;
    left: 12px; right: 12px; bottom: calc(var(--safe-bottom, 0px) + 84px);
    max-width: 520px; margin: 0 auto; max-height: calc(100dvh - 140px); overflow-y: auto;
    display: flex; flex-direction: column; gap: 8px;
    padding: 12px; border-radius: var(--radius-lg, 16px);
    background: var(--surface-2); border: 1px solid var(--border);
    box-shadow: 0 10px 30px rgba(0,0,0,.35); color: var(--text-1);
  }
  .pl-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .pl-thumbs { display: flex; gap: 6px; flex-wrap: wrap; }
  .pl-thumb { width: 56px; height: 56px; border-radius: var(--radius-md, 10px); object-fit: cover; }
  .pl-add-photo {
    width: 56px; height: 56px; border-radius: var(--radius-md, 10px); border: 1px dashed var(--border);
    background: var(--surface-3); color: var(--text-2); display: flex; flex-direction: column;
    align-items: center; justify-content: center; font-size: 11px; cursor: pointer;
  }
  .pl-title { display: flex; align-items: center; gap: 6px; font-weight: 600; }
  .pl-title.err { color: #ef4444; }
  .pl-title .ok { color: var(--accent); font-size: 20px; }
  .pl-sub { font-size: .85em; color: var(--text-2); overflow-wrap: anywhere; }
  .pl-source { font-size: .75em; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--text-3); }
  .pl-source[data-source="label"], .pl-source[data-source="web"] { color: var(--accent); }
  .pl-name-input, .pl-grid input, .pl-grid select {
    width: 100%; box-sizing: border-box; background: var(--surface-1, transparent); color: var(--text-1);
    border: 1px solid var(--border); border-radius: var(--radius-sm, 8px); padding: 6px 8px; font-size: 15px;
  }
  .pl-name-input { font-weight: 600; }
  .pl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); gap: 6px; }
  .pl-grid label { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--text-3); min-width: 0; }
  .pl-grid .k input { color: var(--macro-calories); } .pl-grid .p input { color: var(--macro-protein); }
  .pl-grid .c input { color: var(--macro-carbs); } .pl-grid .f input { color: var(--macro-fat); }
  .pl-amt { display: flex; gap: 4px; } .pl-amt select { width: auto; }
  .pl-warn { font-size: .8em; color: #f59e0b; }
  .pl-question { padding: 8px; border-radius: var(--radius-md, 10px); background: var(--surface-3); display: flex; flex-direction: column; gap: 6px; }
  .pl-q-text { font-size: .9em; font-weight: 600; }
  .pl-meal.skip { opacity: .75; }
  .pl-shared { font-size: .8em; color: var(--accent); }
  .pl-stepper { display: flex; align-items: center; gap: 10px; font-size: .9em; }
  .pl-stepper span { min-width: 90px; text-align: center; font-weight: 600; }
  .pl-check { display: flex; align-items: center; gap: 6px; font-size: .85em; color: var(--text-2); }
  .pl-btn { padding: 9px 12px; border-radius: var(--radius-md, 10px); border: 1px solid var(--border); background: var(--surface-3); color: var(--text-1); font-weight: 600; cursor: pointer; }
  .pl-btn.primary { background: var(--accent); color: #04120b; border-color: transparent; }
  .pl-btn:disabled { opacity: .6; }
  .pl-log-label { font-size: .8em; color: var(--text-3); }
  .pl-meals { display: flex; flex-wrap: wrap; gap: 6px; }
  .pl-meal { padding: 6px 11px; border-radius: var(--radius-full, 999px); font-size: .85em; background: var(--surface-3); color: var(--text-1); border: 1px solid var(--border); cursor: pointer; }
  .pl-meal.suggested { border-color: var(--accent); color: var(--accent); }
  .pl-meal:disabled { opacity: .5; }
  .pl-spinner { width: 14px; height: 14px; border-radius: 50%; flex: none; border: 2px solid var(--surface-3); border-top-color: var(--accent); animation: pl-spin .8s linear infinite; }
  @keyframes pl-spin { to { transform: rotate(360deg); } }
  .pl-close { flex: none; }
</style>
