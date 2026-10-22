<!--
  WeeklyCheckIn (fork): the last 7 days of intake next to the adaptive burn
  and the weight trend. Intake comes from the diary, burn and trend from the
  same /api/goals/adaptive-tdee call the Goals page already uses.
-->
<script>
  import { onMount } from 'svelte';
  import { NtApi } from '../../lib/api.js';
  import { localDateStr } from '../../lib/db.js';
  import { Nutrition } from '../../lib/nutrition.js';
  import { summarizeWeek, verdictText } from '../../lib/weekly-checkin.js';
  import { energyUnit, weightUnit } from '../../stores/settings.js';

  let loading = true;
  let failed = false;
  let s = null;

  const kgOut = (kg) => $weightUnit === 'kg' ? kg : kg * 2.20462;
  const wFmt = (kg) => {
    const v = Math.round(kgOut(kg) * 100) / 100;
    return `${v > 0 ? '+' : ''}${v} ${$weightUnit === 'kg' ? 'kg' : 'lb'}/wk`;
  };
  const eFmt = (kcal) => { const e = Nutrition.displayEnergy(Math.abs(kcal), $energyUnit); return `${e.value.toLocaleString()} ${e.unit}`; };

  async function load() {
    loading = true; failed = false;
    try {
      const days = [];
      for (let o = 1; o <= 7; o++) {            // the 7 full days before today
        const d = new Date(); d.setDate(d.getDate() - o);
        days.push(localDateStr(d));
      }
      const [entries, adaptive] = await Promise.all([
        Promise.all(days.map(d => NtApi.getDiaryDate(d).catch(() => null))),
        NtApi.get('/api/goals/adaptive-tdee').catch(() => null),
      ]);
      const dayCalories = entries.map(e => {
        const items = (e && e.items) || [];
        return items.length ? Math.round(Nutrition.sum(items.map(i => Nutrition.calculate(i))).calories || 0) : null;
      });
      s = summarizeWeek({ dayCalories, adaptive });
    } catch { failed = true; }
    loading = false;
  }
  onMount(load);
</script>

<div class="card weekly-card" data-testid="weekly-checkin">
  <div class="wk-head">
    <span class="material-symbols-rounded wk-icon" aria-hidden="true">event_repeat</span>
    <div class="wk-title">Weekly check-in <span class="wk-sub">last 7 days</span></div>
  </div>
  {#if loading}
    <div class="text-3 text-sm">Loading…</div>
  {:else if failed || !s}
    <div class="text-3 text-sm">Couldn't load this week. <button class="wk-link" on:click={load}>Retry</button></div>
  {:else}
    <div class="wk-grid">
      <div class="wk-cell"><div class="wk-num">{s.avgIntake != null ? eFmt(s.avgIntake) : '—'}</div><div class="wk-lab">avg intake / day · {s.loggedDays} of {s.totalDays} days logged</div></div>
      <div class="wk-cell"><div class="wk-num">{s.tdee != null ? eFmt(s.tdee) : '—'}</div><div class="wk-lab">adaptive burn / day</div></div>
      <div class="wk-cell"><div class="wk-num">{s.expectedKgPerWeek != null ? wFmt(s.expectedKgPerWeek) : '—'}</div><div class="wk-lab">expected from intake</div></div>
      <div class="wk-cell"><div class="wk-num">{s.trendKgPerWeek != null ? wFmt(s.trendKgPerWeek) : '—'}</div><div class="wk-lab">weight trend</div></div>
    </div>
    <p class="wk-verdict" data-verdict={s.verdict}>{verdictText(s.verdict)}</p>
    {#if s.verdict === 'building' && s.daysAvailable != null}
      <p class="text-3 text-sm" style="margin:4px 0 0">{s.daysAvailable} of {s.daysRequired} days of data so far.</p>
    {/if}
  {/if}
</div>

<style>
  .weekly-card { margin-bottom: 12px; padding: 14px 16px; }
  .wk-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .wk-icon { color: var(--accent); font-size: 22px; }
  .wk-title { font-weight: 700; }
  .wk-sub { font-weight: 500; font-size: 12px; color: var(--text-3); margin-left: 6px; }
  .wk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
  .wk-num { font-size: 18px; font-weight: 700; }
  .wk-lab { font-size: 12px; color: var(--text-3); }
  .wk-verdict { margin: 12px 0 0; font-size: 14px; line-height: 1.4; }
  .wk-link { background: none; border: 0; color: var(--accent); font-weight: 600; padding: 0; }
</style>
