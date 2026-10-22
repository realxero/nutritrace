<!--
  ProgressCard (fork): streaks, how far from your start weight to your goal, the next
  milestone with something familiar to picture it ("about the weight of a pineapple"),
  and a celebration the first time you reach a milestone or achievement. Tap Timeline
  for the full dated list. Maths in lib/progress.js; nothing here changes your data.
-->
<script>
  import { onMount } from 'svelte';
  import { NtApi } from '../../lib/api.js';
  import { DB, localDateStr } from '../../lib/db.js';
  import { getProgressData } from '../../lib/progress-data.js';
  import { buildProgress, newEvents } from '../../lib/progress.js';
  import { weightPhrase } from '../../lib/weight-compare.js';
  import { projectFromAdaptive } from '../../lib/goal-projection.js';
  import { weightUnit, goals, targetWeightKg, planStart, celebratedEvents, showProgress } from '../../stores/settings.js';
  import TimelineSheet from './TimelineSheet.svelte';

  let data = null;
  let adaptive = null;
  let loaded = false;
  let showTimeline = false;
  const LB = 2.20462;

  onMount(async () => {
    if (!$showProgress) { loaded = true; return; }
    [data, adaptive] = await Promise.all([getProgressData(), NtApi.get('/api/goals/adaptive-tdee').catch(() => null)]);
    loaded = true;
  });

  $: today = localDateStr();
  $: unit = $weightUnit === 'kg' ? 'kg' : 'lb';
  $: calorieGoal = $goals?.calories?.max ?? null;
  $: goalKg = Number($targetWeightKg) || null;
  $: progress = data ? buildProgress({ days: data.days, series: data.series, goalKg, start: $planStart, today, calorieGoal, unit }) : null;
  $: disp = (kg) => Math.round((unit === 'lb' ? kg * LB : kg) * 10) / 10;
  $: proj = projectFromAdaptive({ adaptive, targetKg: goalKg, plannedIntake: calorieGoal, profileKg: Number(DB.getSetting('weight_kg', 0)) || null, profileTdee: Number(DB.getSetting('tdee', 0)) || null, today }).result;
  const dayLabel = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };

  // New milestones / achievements since last time. The very first run marks everything quietly.
  let celebrate = [];
  $: if (progress && loaded) {
    const r = newEvents(progress.events, $celebratedEvents);
    celebrate = r.fresh.slice(-3).reverse();
    if (!($celebratedEvents || []).length) celebratedEvents.set(r.mark.slice(-300));
  }
  function dismissCelebration() {
    celebratedEvents.set([...new Set([...($celebratedEvents || []), ...progress.events.map(e => e.id)])].slice(-300));
    celebrate = [];
  }
  $: phrase = (e) => e.phrase || '';
</script>

{#if $showProgress && loaded && progress && (progress.daysLogged > 0 || progress.weighIns > 0)}
  <div class="card pc" data-testid="progress-card">
    {#if celebrate.length}
      <div class="pc-cele" role="status" data-testid="celebration">
        <span class="pc-party" aria-hidden="true">🎉</span>
        <div class="pc-cele-body">
          {#each celebrate as e (e.id)}
            <div class="pc-cele-line"><strong>{e.title}</strong>{#if e.phrase}<span class="pc-sub"> · {e.phrase}</span>{/if}</div>
          {/each}
        </div>
        <button type="button" class="pc-x" aria-label="Dismiss" on:click={dismissCelebration}><span class="material-symbols-rounded" aria-hidden="true">close</span></button>
      </div>
    {/if}

    <div class="pc-head">
      <span class="material-symbols-rounded pc-icon" aria-hidden="true">timeline</span>
      <div class="pc-title">Progress</div>
      <button type="button" class="pc-link" on:click={() => (showTimeline = true)} data-testid="open-timeline">Timeline</button>
    </div>

    <div class="pc-streaks">
      <div><div class="pc-num">{progress.streak.current}</div><div class="pc-lab">day streak</div></div>
      <div><div class="pc-num">{progress.streak.longest}</div><div class="pc-lab">longest</div></div>
      <div><div class="pc-num">{progress.daysLogged}</div><div class="pc-lab">days logged</div></div>
    </div>

    {#if progress.start && goalKg && progress.fraction != null}
      <div class="pc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress.fraction * 100)}>
        <div class="pc-fill" style="width:{Math.max(3, Math.round(progress.fraction * 100))}%"></div>
      </div>
      <div class="pc-bar-labels"><span><strong>{disp(progress.start.kg)} {unit}</strong><br><span class="pc-lab">start</span></span><span class="pc-right"><strong>{disp(goalKg)} {unit}</strong><br><span class="pc-lab">goal</span></span></div>
      {#if proj?.status === 'ok' && proj.earliest}
        <p class="pc-sub">On your current pace, about <strong>{dayLabel(proj.latest)}</strong>.</p>
      {/if}
      {#if progress.next}
        <div class="pc-next" data-testid="next-milestone">
          <span class="pc-next-arrow">{progress.direction === 'lose' ? '↓' : '↑'} {progress.next.amount} {unit}</span>
          <span class="pc-sub">next milestone{progress.next.phrase ? `, ${progress.next.phrase}` : ''}</span>
        </div>
      {/if}
    {:else if !goalKg}
      <p class="pc-sub">Set a goal weight above and your milestones appear here.</p>
    {/if}
  </div>
  <TimelineSheet bind:open={showTimeline} {progress} {unit} {goalKg} {today} />
{/if}

<style>
  .pc { margin-bottom: 12px; padding: 14px 16px; }
  .pc-cele { display: flex; align-items: flex-start; gap: 10px; padding: 10px 6px 10px 12px; margin: -4px -6px 12px; border-radius: var(--radius-sm); background: var(--accent-dim); }
  .pc-party { font-size: 22px; line-height: 1.2; }
  .pc-cele-body { flex: 1; min-width: 0; }
  .pc-cele-line { font-size: 14px; line-height: 1.4; }
  .pc-x { width: 40px; height: 40px; flex-shrink: 0; border: 0; background: none; color: var(--text-3); cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .pc-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .pc-icon { color: var(--accent); font-size: 22px; }
  .pc-title { flex: 1; font-weight: 700; }
  .pc-link { background: none; border: 0; color: var(--accent); font: inherit; font-weight: 600; min-height: 40px; padding: 0 4px; cursor: pointer; }
  .pc-streaks { display: flex; gap: 8px; }
  .pc-streaks > div { flex: 1; text-align: center; padding: 8px 4px; border-radius: var(--radius-sm); background: var(--surface-2); }
  .pc-num { font-size: 22px; font-weight: 800; }
  .pc-lab { font-size: 12px; color: var(--text-3); }
  .pc-bar { height: 10px; border-radius: 999px; background: var(--surface-2); overflow: hidden; margin-top: 14px; }
  .pc-fill { height: 100%; border-radius: 999px; background: var(--accent); }
  .pc-bar-labels { display: flex; justify-content: space-between; margin-top: 6px; font-size: 14px; }
  .pc-right { text-align: right; }
  .pc-sub { margin: 8px 0 0; font-size: 13px; line-height: 1.4; color: var(--text-3); }
  .pc-next { margin-top: 12px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--surface-2); display: flex; flex-direction: column; gap: 2px; }
  .pc-next-arrow { font-size: 18px; font-weight: 700; }
  .pc-next .pc-sub { margin: 0; }
</style>
