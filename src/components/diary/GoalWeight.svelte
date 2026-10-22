<!--
  GoalWeight (fork): goal weight, an optional "be there by" date, and an
  estimated date range for reaching it. The range tightens as more days are
  logged. With a date set it also shows the calories per day that date needs,
  and flags a pace that is hard to sustain. Maths lives in lib/goal-projection.js.

  Colours stay neutral/amber: going over or behind is information, not an error.
-->
<script>
  import { onMount } from 'svelte';
  import { NtApi } from '../../lib/api.js';
  import { DB, localDateStr } from '../../lib/db.js';
  import { Nutrition } from '../../lib/nutrition.js';
  import { parseDecimal, decimalInput } from '../../lib/decimal-input.js';
  import { projectGoal, statusText, daysBetween } from '../../lib/goal-projection.js';
  import { goals, energyUnit, weightUnit, targetWeightKg, targetWeightDate } from '../../stores/settings.js';
  import DateInput from '../ui/DateInput.svelte';

  const LB = 2.20462;
  let adaptive = null;
  let loaded = false;
  let editing = false;
  let wInput = '';
  let dInput = '';

  const isLb = () => $weightUnit === 'lb';
  const toDisp = (kg) => isLb() ? kg * LB : kg;
  const wFmt = (kg) => `${(Math.round(toDisp(kg) * 10) / 10).toLocaleString()} ${isLb() ? 'lb' : 'kg'}`;
  const eFmt = (kcal) => { const e = Nutrition.displayEnergy(Math.abs(kcal), $energyUnit); return `${e.value.toLocaleString()} ${e.unit}`; };
  const dayFmt = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(y !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  };
  function away(days) {
    if (days < 14) return `${days} days`;
    if (days < 70) return `${Math.round(days / 7)} weeks`;
    return `${Math.round(days / 30.4)} months`;
  }

  onMount(async () => {
    try { adaptive = await NtApi.get('/api/goals/adaptive-tdee'); } catch { adaptive = null; }
    loaded = true;
  });

  // Current weight: smoothed trend → latest reading → the profile weight.
  $: profileKg = Number(DB.getSetting('weight_kg', 0)) || null;
  $: currentKg = adaptive?.trendWeightKg ?? adaptive?.latestWeightKg ?? profileKg;
  $: weightFrom = adaptive?.trendWeightKg != null ? 'trend' : adaptive?.latestWeightKg != null ? 'latest' : 'profile';
  $: profileTdee = Number(DB.getSetting('tdee', 0)) || null;
  $: tdee = adaptive?.ready && adaptive.tdee != null ? adaptive.tdee : profileTdee;
  $: plannedIntake = $goals?.calories?.max ?? null;
  $: today = localDateStr();
  $: r = projectGoal({
    currentKg, targetKg: Number($targetWeightKg) || null,
    tdee, tdeeIsAdaptive: !!(adaptive?.ready && adaptive.tdee != null),
    avgIntake: adaptive?.recentAvgIntake ?? null, loggedDays: adaptive?.recentLoggedDays ?? 0,
    trendKgPerWeek: adaptive?.ready ? adaptive.trendKgPerWeek : null,
    plannedIntake, targetDate: $targetWeightDate || null, today,
  });

  function startEdit() {
    wInput = $targetWeightKg ? String(Math.round(toDisp($targetWeightKg) * 10) / 10) : '';
    dInput = $targetWeightDate || '';
    editing = true;
  }
  function save() {
    const v = parseDecimal(wInput);
    if (!Number.isFinite(v) || v <= 0) { targetWeightKg.set(null); }
    else targetWeightKg.set(Math.round((isLb() ? v / LB : v) * 100) / 100);
    targetWeightDate.set(dInput && daysBetween(today, dInput) > 0 ? dInput : '');
    editing = false;
  }
  function clearGoal() { targetWeightKg.set(null); targetWeightDate.set(''); editing = false; }

  $: showEditor = editing || (loaded && r.status === 'no-target');
  $: perWeek = r.ratePerWeekKg != null ? `${r.ratePerWeekKg > 0 ? '+' : '−'}${(Math.round(toDisp(Math.abs(r.ratePerWeekKg)) * 100) / 100)} ${isLb() ? 'lb' : 'kg'}/wk` : null;
</script>

<div class="card gw-card" data-testid="goal-weight">
  <div class="gw-head">
    <span class="material-symbols-rounded gw-icon" aria-hidden="true">flag</span>
    <div class="gw-title">Goal weight</div>
    {#if !showEditor && loaded}
      <button class="gw-link" on:click={startEdit} aria-label="Edit goal weight">Edit</button>
    {/if}
  </div>

  {#if !loaded}
    <div class="text-3 text-sm">Loading…</div>
  {:else if showEditor}
    <div class="gw-form">
      <label class="gw-field">
        <span class="gw-lab">Goal weight ({isLb() ? 'lb' : 'kg'})</span>
        <input class="gw-input" type="text" inputmode="decimal" use:decimalInput bind:value={wInput}
          placeholder={currentKg ? String(Math.round(toDisp(currentKg))) : ''} data-testid="gw-weight" />
      </label>
      <div class="gw-field">
        <span class="gw-lab">Be there by <span class="text-3">(optional)</span></span>
        <DateInput bind:value={dInput} min={today} />
      </div>
      <div class="gw-actions">
        <button class="btn btn-primary" on:click={save} data-testid="gw-save">Save</button>
        {#if $targetWeightKg}
          <button class="btn btn-ghost" on:click={() => (editing = false)}>Cancel</button>
          <button class="btn btn-ghost" on:click={clearGoal}>Remove goal</button>
        {/if}
      </div>
    </div>
  {:else}
    <div class="gw-journey">
      <div><div class="gw-num">{currentKg ? wFmt(currentKg) : '—'}</div><div class="gw-lab">{weightFrom === 'trend' ? 'trend weight' : weightFrom === 'latest' ? 'latest weigh-in' : 'profile weight'}</div></div>
      <span class="material-symbols-rounded gw-arrow" aria-hidden="true">arrow_forward</span>
      <div><div class="gw-num">{wFmt($targetWeightKg)}</div><div class="gw-lab">goal{r.remainingKg != null && r.status !== 'reached' ? ` · ${wFmt(r.remainingKg)} to go` : ''}</div></div>
    </div>

    {#if r.status === 'ok' && r.earliest}
      <div class="gw-eta" data-testid="gw-eta">
        <div class="gw-eta-range">{dayFmt(r.earliest)}{r.latest !== r.earliest ? ` – ${dayFmt(r.latest)}` : ''}</div>
        <div class="gw-lab">about {away(Math.round((r.daysEarliest + r.daysLatest) / 2))} away{perWeek ? ` · pace ${perWeek}` : ''}</div>
      </div>
      <p class="gw-note">
        {#if r.basis === 'plan'}Based on your calorie goal, not logged food yet.
        {:else}Based on {adaptive?.recentLoggedDays ?? 0} of the last 14 days logged{r.confidence === 'good' ? '.' : ''}{/if}
        {#if r.needMoreDays > 0 && r.basis !== 'plan'} Log {r.needMoreDays} more {r.needMoreDays === 1 ? 'day' : 'days'} to tighten the range.{/if}
      </p>
    {:else}
      <p class="gw-note" data-testid="gw-status">{statusText(r)}{#if r.status === 'no-estimate' && r.needMoreDays > 0} Log {r.needMoreDays} more {r.needMoreDays === 1 ? 'day' : 'days'}.{/if}</p>
    {/if}

    {#if r.required}
      <div class="gw-date" data-testid="gw-required">
        {#if r.required.past}
          <div class="gw-lab">Your goal date has passed. Tap Edit to pick a new one.</div>
        {:else}
          <div class="gw-date-head">To be there by <strong>{dayFmt($targetWeightDate)}</strong>
            {#if r.onTrack}<span class="gw-chip" data-state={r.onTrack}>{r.onTrack === 'behind' ? 'behind pace' : r.onTrack === 'ahead' ? 'ahead of pace' : 'on pace'}</span>{/if}
          </div>
          <div class="gw-date-body">
            {#if r.required.kcalPerDay != null}<strong>{eFmt(r.required.kcalPerDay)}</strong> a day
              <span class="text-3">({eFmt(r.required.dailyBalance)} {r.required.dailyBalance < 0 ? 'below' : 'above'} your burn)</span>{/if}
            <span class="text-3"> · {Math.round(toDisp(r.required.kgPerWeek) * 100) / 100} {isLb() ? 'lb' : 'kg'}/wk</span>
          </div>
          {#if r.warnings.includes('low-calories')}
            <p class="gw-warn">That is under 1,200 kcal a day, which is hard to sustain. A later date would ease it.</p>
          {:else if r.warnings.includes('aggressive')}
            <p class="gw-warn">That is faster than about {r.direction === 'lose' ? '1%' : '0.5%'} of your body weight a week, which is hard to sustain. A later date would ease it.</p>
          {/if}
        {/if}
      </div>
    {:else if r.warnings.includes('fast-pace')}
      <p class="gw-warn">Your current pace is faster than about {r.direction === 'lose' ? '1%' : '0.5%'} of your body weight a week.</p>
    {/if}
  {/if}
</div>

<style>
  .gw-card { margin-bottom: 12px; padding: 14px 16px; }
  .gw-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .gw-icon { color: var(--accent); font-size: 22px; }
  .gw-title { font-weight: 700; flex: 1; }
  .gw-link { background: none; border: 0; color: var(--accent); font-weight: 600; padding: 8px 4px; min-height: 40px; cursor: pointer; }
  .gw-journey { display: flex; align-items: center; gap: 12px; }
  .gw-arrow { color: var(--text-3); font-size: 20px; }
  .gw-num { font-size: 20px; font-weight: 700; }
  .gw-lab { font-size: 12px; color: var(--text-3); }
  .gw-eta { margin-top: 12px; padding: 12px; border-radius: var(--radius-sm); background: var(--accent-dim); }
  .gw-eta-range { font-size: 22px; font-weight: 800; }
  .gw-note { margin: 10px 0 0; font-size: 13px; line-height: 1.4; color: var(--text-2); }
  .gw-date { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
  .gw-date-head { font-size: 14px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .gw-date-body { margin-top: 4px; font-size: 14px; }
  .gw-chip { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--surface-2); color: var(--text-2); }
  .gw-chip[data-state='behind'] { background: rgba(234, 179, 8, .18); color: #eab308; }
  .gw-chip[data-state='ahead'], .gw-chip[data-state='on-track'] { background: var(--accent-dim); color: var(--accent); }
  .gw-warn { margin: 8px 0 0; font-size: 13px; line-height: 1.4; color: #eab308; }
  .gw-form { display: flex; flex-direction: column; gap: 12px; }
  .gw-field { display: flex; flex-direction: column; gap: 4px; }
  .gw-input { width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm);
              padding: 10px 12px; font-size: 16px; color: var(--text-1); }
  .gw-actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
