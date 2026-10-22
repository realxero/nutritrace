<!--
  RecapCard (fork): last month in a few lines, on the Goals page once a month has finished.
  Days logged, how often you landed within your calorie goal, the weight trend with something
  familiar to picture it, your best streak and what you earned. Kind about a hard month.
  "Got it" hides it until the next month; Share sends the text. Maths in lib/recap.js.
-->
<script>
  import { onMount } from 'svelte';
  import { localDateStr } from '../../lib/db.js';
  import { isNative } from '../../lib/platform.js';
  import { copyText } from '../../lib/clipboard.js';
  import { getProgressData } from '../../lib/progress-data.js';
  import { buildProgress } from '../../lib/progress.js';
  import { buildRecap, previousMonth, recapText } from '../../lib/recap.js';
  import { goals, weightUnit, targetWeightKg, planStart, showRecap, recapSeen } from '../../stores/settings.js';
  import { showSuccess, showError } from '../../stores/toast.js';

  let data = null;
  onMount(async () => { if ($showRecap) { try { data = await getProgressData(); } catch { data = null; } } });

  $: today = localDateStr();
  $: month = previousMonth(today);
  $: unit = $weightUnit === 'kg' ? 'kg' : 'lb';
  $: calorieGoal = $goals?.calories?.max ?? null;
  $: events = data ? buildProgress({ days: data.days, series: data.series, goalKg: Number($targetWeightKg) || null, start: $planStart, today, calorieGoal, unit }).events : [];
  $: recap = (data && $showRecap && $recapSeen !== month) ? buildRecap({ days: data.days, series: data.series, events, calorieGoal, month, unit }) : null;
  const dismiss = () => recapSeen.set(month);

  async function share() {
    const body = recapText(recap);
    try {
      if (isNative) { const { Share } = await import('@capacitor/share'); await Share.share({ title: `${recap.label} recap`, text: body }); }
      else if (typeof navigator !== 'undefined' && navigator.share) await navigator.share({ title: `${recap.label} recap`, text: body });
      else { await copyText(body); showSuccess('Copied the recap'); }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      try { await copyText(body); showSuccess('Copied the recap'); } catch { showError('Could not share the recap'); }
    }
  }
</script>

{#if recap}
  <div class="card rc" data-testid="recap-card">
    <div class="rc-head">
      <span class="material-symbols-rounded rc-icon" aria-hidden="true">calendar_month</span>
      <div class="rc-title">{recap.label}</div>
    </div>
    <p class="rc-headline">{recap.headline}</p>
    <div class="rc-grid">
      <div><div class="rc-num">{recap.daysLogged}<span class="rc-of">/{recap.daysInMonth}</span></div><div class="rc-lab">days logged</div></div>
      <div><div class="rc-num">{recap.avgCalories.toLocaleString()}</div><div class="rc-lab">avg kcal{recap.calorieGoal ? ` · goal ${recap.calorieGoal.toLocaleString()}` : ''}</div></div>
      <div><div class="rc-num">{recap.avgProtein} g</div><div class="rc-lab">avg protein</div></div>
      <div><div class="rc-num">{recap.longestStreak}</div><div class="rc-lab">day best streak</div></div>
    </div>
    {#if recap.earned.length}
      <ul class="rc-earned">
        {#each recap.earned.slice(0, 4) as e (e.id)}<li><span class="material-symbols-rounded" aria-hidden="true">emoji_events</span> {e.title}{#if e.phrase}<span class="rc-lab"> · {e.phrase}</span>{/if}</li>{/each}
      </ul>
    {/if}
    <div class="rc-actions">
      <button type="button" class="btn btn-secondary" on:click={share} data-testid="recap-share"><span class="material-symbols-rounded" style="font-size:18px" aria-hidden="true">ios_share</span> Share</button>
      <button type="button" class="btn btn-ghost" on:click={dismiss} data-testid="recap-dismiss">Got it</button>
    </div>
  </div>
{/if}

<style>
  .rc { margin-bottom: 12px; padding: 14px 16px; }
  .rc-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .rc-icon { color: var(--accent); font-size: 22px; }
  .rc-title { font-weight: 700; }
  .rc-headline { margin: 0 0 12px; font-size: 15px; line-height: 1.45; }
  .rc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .rc-grid > div { padding: 10px; border-radius: var(--radius-sm); background: var(--surface-2); }
  .rc-num { font-size: 20px; font-weight: 800; }
  .rc-of { font-size: 13px; font-weight: 600; color: var(--text-3); }
  .rc-lab { font-size: 12px; color: var(--text-3); line-height: 1.35; }
  .rc-earned { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
  .rc-earned .material-symbols-rounded { font-size: 18px; vertical-align: -4px; color: var(--accent); }
  .rc-actions { display: flex; gap: 8px; margin-top: 14px; }
  .rc-actions .btn { flex: 1; }
</style>
