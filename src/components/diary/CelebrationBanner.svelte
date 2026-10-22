<!--
  CelebrationBanner (fork): the first time you reach a milestone or achievement, a short
  "you did it" at the top of the Diary, with something familiar to picture it. Same events and
  the same "already shown" list as the Progress card on Goals, so each is celebrated once.
  The first time it runs it marks what you already have, without a flood of confetti.
-->
<script>
  import { onMount } from 'svelte';
  import { localDateStr } from '../../lib/db.js';
  import { getProgressData } from '../../lib/progress-data.js';
  import { buildProgress, newEvents } from '../../lib/progress.js';
  import { goals, weightUnit, targetWeightKg, planStart, celebratedEvents, showProgress } from '../../stores/settings.js';

  let data = null;
  onMount(async () => { if ($showProgress) { try { data = await getProgressData(); } catch { data = null; } } });

  $: today = localDateStr();
  $: unit = $weightUnit === 'kg' ? 'kg' : 'lb';
  $: progress = data ? buildProgress({ days: data.days, series: data.series, goalKg: Number($targetWeightKg) || null, start: $planStart, today, calorieGoal: $goals?.calories?.max ?? null, unit }) : null;
  let fresh = [];
  $: if (progress && $showProgress) {
    const r = newEvents(progress.events, $celebratedEvents);
    fresh = r.fresh.slice(-2).reverse();
    if (!($celebratedEvents || []).length) celebratedEvents.set(r.mark.slice(-300));
  } else fresh = [];
  function dismiss() {
    celebratedEvents.set([...new Set([...($celebratedEvents || []), ...progress.events.map(e => e.id)])].slice(-300));
    fresh = [];
  }
</script>

{#if fresh.length}
  <div class="cb" role="status" data-testid="diary-celebration">
    <span class="cb-party" aria-hidden="true">🎉</span>
    <div class="cb-body">
      {#each fresh as e (e.id)}<div class="cb-line"><strong>{e.title}</strong>{#if e.phrase}<span class="cb-sub"> · {e.phrase}</span>{/if}</div>{/each}
    </div>
    <button type="button" class="cb-x" aria-label="Dismiss" on:click={dismiss}><span class="material-symbols-rounded" aria-hidden="true">close</span></button>
  </div>
{/if}

<style>
  .cb { display: flex; align-items: flex-start; gap: 10px; margin: 0 0 12px; padding: 10px 6px 10px 14px; border-radius: var(--radius-lg, 14px); background: var(--accent-dim); }
  .cb-party { font-size: 22px; line-height: 1.2; }
  .cb-body { flex: 1; min-width: 0; }
  .cb-line { font-size: 14px; line-height: 1.4; }
  .cb-sub { color: var(--text-2); }
  .cb-x { width: 40px; height: 40px; flex-shrink: 0; border: 0; background: none; color: var(--text-3); cursor: pointer; display: flex; align-items: center; justify-content: center; }
</style>
