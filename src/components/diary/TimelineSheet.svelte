<!--
  TimelineSheet (fork): the full timeline: streaks, progress from the start to your goal,
  what is next (with progress), and everything reached, newest first, each milestone with
  something familiar to picture it. "Restart from today" begins a new plan from your current
  trend weight (with Undo); old milestones stay in the history only if they were before it.
-->
<script>
  import Sheet from '../ui/Sheet.svelte';
  import { planStart } from '../../stores/settings.js';
  import { showUndo } from '../../stores/toast.js';

  export let open = false;
  export let progress = null;
  export let unit = 'lb';
  export let goalKg = null;
  export let today = '';

  const LB = 2.20462;
  const disp = (kg) => Math.round((unit === 'lb' ? kg * LB : kg) * 10) / 10;
  const ICON = { plan: 'flag_circle', milestone: 'flag', 'goal-reached': 'emoji_events' };
  const iconFor = (e) => e.kind === 'plan' ? 'flag_circle' : e.kind === 'milestone' ? 'flag'
    : e.id.startsWith('weights') ? 'monitor_weight' : e.id.startsWith('streak') ? 'local_fire_department' : e.id.startsWith('perfect') ? 'emoji_events' : 'wb_twilight';
  const dateLabel = (d) => { const [y, m, dd] = d.split('-').map(Number); const t = new Date(y, m - 1, dd); return t.toLocaleDateString(undefined, t.getFullYear() === new Date().getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }); };

  function restart() {
    if (progress?.nowKg == null) return;
    const before = $planStart;
    planStart.set({ date: today, kg: Math.round(progress.nowKg * 100) / 100 });
    showUndo('Started a new plan from today', () => planStart.set(before || null));
    open = false;
  }
</script>

<Sheet bind:open title="Timeline">
  {#if progress}
    <div class="tl" data-testid="timeline">
      <div class="tl-streaks">
        <div><div class="tl-num">{progress.streak.current} {progress.streak.current === 1 ? 'day' : 'days'}</div><div class="tl-lab">Current streak</div></div>
        <div><div class="tl-num">{progress.streak.longest} {progress.streak.longest === 1 ? 'day' : 'days'}</div><div class="tl-lab">Longest streak</div></div>
      </div>

      {#if progress.start && goalKg && progress.fraction != null}
        <div class="tl-box">
          <div class="tl-bar"><div class="tl-fill" style="width:{Math.max(3, Math.round(progress.fraction * 100))}%"></div></div>
          <div class="tl-bar-labels"><span><strong>{disp(progress.start.kg)} {unit}</strong><br><span class="tl-lab">Start weight</span></span><span class="tl-right"><strong>{disp(goalKg)} {unit}</strong><br><span class="tl-lab">Goal weight</span></span></div>
          {#if progress.changeKg != null}
            <p class="tl-lab">{progress.changeKg < 0 ? 'Down' : 'Up'} {Math.abs(disp(progress.changeKg))} {unit} so far (your smoothed trend).</p>
          {/if}
        </div>
      {/if}

      {#if progress.next || progress.upcoming.days || progress.upcoming.weights}
        <h3 class="tl-h">Coming up</h3>
        <ul class="tl-list">
          {#if progress.next}
            <li class="tl-row" data-testid="timeline-next">
              <span class="material-symbols-rounded tl-ico" aria-hidden="true">flag</span>
              <span class="tl-body"><span class="tl-lab">Next milestone</span><span class="tl-title">{progress.direction === 'lose' ? '↓' : '↑'} {progress.next.amount} {unit}</span>{#if progress.next.phrase}<span class="tl-lab">{progress.next.phrase}</span>{/if}</span>
            </li>
          {/if}
          {#each [['days', 'days logged', progress.upcoming.days], ['weights', 'weights logged', progress.upcoming.weights]] as [k, label, u]}
            {#if u}
              <li class="tl-row">
                <span class="material-symbols-rounded tl-ico" aria-hidden="true">{k === 'days' ? 'wb_twilight' : 'monitor_weight'}</span>
                <span class="tl-body"><span class="tl-lab">Next achievement</span><span class="tl-title">{u.target} {label}</span>
                  <span class="tl-mini"><span class="tl-mini-fill" style="width:{Math.min(100, Math.round((u.have / u.target) * 100))}%"></span></span>
                  <span class="tl-lab">{u.have} of {u.target}</span></span>
              </li>
            {/if}
          {/each}
        </ul>
      {/if}

      <h3 class="tl-h">History</h3>
      {#if progress.events.length}
        <ul class="tl-list" data-testid="timeline-history">
          {#each progress.events as e (e.id)}
            <li class="tl-row">
              <span class="material-symbols-rounded tl-ico" aria-hidden="true">{iconFor(e)}</span>
              <span class="tl-body">
                <span class="tl-lab">{e.kind === 'plan' ? '' : e.kind === 'milestone' ? 'Milestone' : 'Achievement'}</span>
                <span class="tl-title">{e.title}</span>
                {#if e.phrase}<span class="tl-lab">{e.phrase}</span>{/if}
                {#if e.sub}<span class="tl-lab">{e.sub}</span>{/if}
              </span>
              <span class="tl-date">{dateLabel(e.date)}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="tl-lab">Log your food and weigh in, and your achievements will show up here.</p>
      {/if}

      {#if progress.nowKg != null}
        <button type="button" class="btn btn-ghost w-full" on:click={restart} data-testid="timeline-restart">Start a new plan from today</button>
      {/if}
    </div>
  {/if}
</Sheet>

<style>
  .tl { display: flex; flex-direction: column; gap: 10px; padding-bottom: 8px; }
  .tl-streaks { display: flex; gap: 8px; }
  .tl-streaks > div { flex: 1; text-align: center; padding: 12px 4px; border-radius: var(--radius-sm); background: var(--surface-2); }
  .tl-num { font-size: 20px; font-weight: 800; }
  .tl-lab { font-size: 12.5px; color: var(--text-3); line-height: 1.35; }
  .tl-box { padding: 12px; border-radius: var(--radius-sm); background: var(--surface-2); }
  .tl-bar { height: 10px; border-radius: 999px; background: var(--border); overflow: hidden; }
  .tl-fill { height: 100%; border-radius: 999px; background: var(--accent); }
  .tl-bar-labels { display: flex; justify-content: space-between; margin-top: 6px; font-size: 14px; }
  .tl-right { text-align: right; }
  .tl-h { margin: 10px 0 0; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); }
  .tl-list { list-style: none; margin: 0; padding: 0; }
  .tl-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .tl-row:last-child { border-bottom: 0; }
  .tl-ico { width: 36px; height: 36px; flex-shrink: 0; border-radius: 50%; background: var(--accent-dim); color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 20px; }
  .tl-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .tl-title { font-size: 15px; font-weight: 600; }
  .tl-date { font-size: 13px; color: var(--text-3); white-space: nowrap; }
  .tl-mini { height: 6px; border-radius: 999px; background: var(--border); overflow: hidden; margin: 4px 0 2px; }
  .tl-mini-fill { display: block; height: 100%; background: var(--accent); }
</style>
