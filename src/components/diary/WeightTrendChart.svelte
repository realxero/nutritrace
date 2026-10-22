<!--
  WeightTrendChart (fork): weigh-ins, the smoothed trend, the goal line and the
  projected date range as a wedge. Plain SVG (no chart library), so it renders
  instantly and follows the theme. Geometry in lib/weight-chart.js.

    dots   actual weigh-ins            line   smoothed trend (daily water swings removed)
    dashed goal weight                 wedge  fastest to slowest recent pace, ending on the goal line
-->
<script>
  import { buildChart } from '../../lib/weight-chart.js';
  import { lastDays, spanDays } from '../../lib/weight-history.js';
  import { weightUnit } from '../../stores/settings.js';

  export let series = [];
  export let longSeries = [];            // the full smoothed history (lib/weight-history.js)
  export let targetKg = null;
  export let projection = null;
  export let today = '';

  const LB = 2.20462;
  let view = '';                         // '' = automatic: 'goal' | '5w' | '3m' | 'all'
  $: hasCone = projection?.status === 'ok' && !!projection?.earliest;
  $: span = spanDays(longSeries);
  $: has3m = span >= 40;
  $: hasAll = span >= 100;
  $: active = view || (hasCone ? 'goal' : '5w');
  $: mode = active === 'goal' ? 'goal' : 'history';
  $: shown = active === '3m' ? lastDays(longSeries, 92, today) : active === 'all' ? longSeries : series;
  $: c = buildChart({ series: shown, targetKg, projection, today, mode });
  $: disp = (kg) => Math.round(($weightUnit === 'lb' ? kg * LB : kg) * 10) / 10;
  $: unitLabel = $weightUnit === 'lb' ? 'lb' : 'kg';
  const dayLabel = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  $: summary = c.empty ? '' : `Weight trend over ${active === 'goal' ? 'the recent weeks and the projection' : active === '3m' ? 'the last three months' : active === 'all' ? 'your whole history' : 'the last five weeks'}: ${disp(c.trendEnd.kg)} ${unitLabel} now${c.goal ? `, goal ${disp(c.goal.kg)} ${unitLabel}` : ''}${c.eta ? `, estimated ${dayLabel(c.eta.earlyDate)} to ${dayLabel(c.eta.lateDate)}` : ''}.`;
</script>

{#if !c.empty}
  <div class="wc" data-testid="weight-chart">
    <div class="wc-head">
      <span class="wc-title">Weight trend</span>
      {#if hasCone || has3m}
        <div class="wc-seg" role="radiogroup" aria-label="Chart range">
          {#if hasCone}<button type="button" role="radio" aria-checked={active === 'goal'} class:on={active === 'goal'} on:click={() => (view = 'goal')}>To goal</button>{/if}
          <button type="button" role="radio" aria-checked={active === '5w'} class:on={active === '5w'} on:click={() => (view = '5w')}>5 wks</button>
          {#if has3m}<button type="button" role="radio" aria-checked={active === '3m'} class:on={active === '3m'} on:click={() => (view = '3m')}>3 mo</button>{/if}
          {#if hasAll}<button type="button" role="radio" aria-checked={active === 'all'} class:on={active === 'all'} on:click={() => (view = 'all')}>All</button>{/if}
        </div>
      {/if}
    </div>
    <svg viewBox="0 0 {c.width} {c.height}" role="img" aria-label={summary} class="wc-svg">
      {#each c.yTicks as t}
        <line x1={c.pad.l} x2={c.width - c.pad.r} y1={t.y} y2={t.y} class="wc-grid" />
        <text x={c.pad.l - 6} y={t.y + 4} class="wc-ytick" text-anchor="end">{disp(t.kg)}</text>
      {/each}
      {#if c.cone}<polygon points={c.cone} class="wc-cone" />{/if}
      {#if c.goal}
        <line x1={c.pad.l} x2={c.width - c.pad.r} y1={c.goal.y} y2={c.goal.y} class="wc-goal" />
        <text x={c.width - c.pad.r} y={c.goal.y - 5} class="wc-goal-lab" text-anchor="end">goal {disp(c.goal.kg)}</text>
      {/if}
      {#if c.xMax > 1}<line x1={c.todayX} x2={c.todayX} y1={c.pad.t} y2={c.height - c.pad.b} class="wc-today" />{/if}
      {#each c.dots as d}<circle cx={d.x} cy={d.y} r="2.6" class="wc-dot" />{/each}
      <path d={c.trend} class="wc-trend" />
      <circle cx={c.trendEnd.x} cy={c.trendEnd.y} r="4" class="wc-now" />
      {#each c.xLabels as l}
        <text x={l.x} y={c.height - 8} class="wc-xlab" text-anchor={l.today && c.xMax > 1 ? 'middle' : l.eta ? 'end' : 'start'}>{l.today ? 'Today' : dayLabel(l.d)}</text>
      {/each}
    </svg>
    <p class="wc-key"><span class="k-dot"></span>weigh-in <span class="k-line"></span>trend{#if c.cone} <span class="k-cone"></span>estimated range{/if}</p>
  </div>
{/if}

<style>
  .wc { margin-top: 14px; }
  .wc-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .wc-title { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); }
  .wc-seg { display: flex; gap: 2px; padding: 2px; border-radius: 999px; background: var(--surface-2); }
  .wc-seg button { min-height: 32px; padding: 0 10px; border: 0; border-radius: 999px; background: none; color: var(--text-2); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .wc-seg button.on { background: var(--accent); color: var(--bg, #fff); }
  .wc-svg { width: 100%; height: auto; display: block; overflow: visible; }
  .wc-grid { stroke: var(--border); stroke-width: 1; }
  .wc-ytick, .wc-xlab { fill: var(--text-3); font-size: 10px; }
  .wc-goal { stroke: var(--text-2); stroke-width: 1.2; stroke-dasharray: 4 4; }
  .wc-goal-lab { fill: var(--text-2); font-size: 10px; font-weight: 600; }
  .wc-today { stroke: var(--border-strong, var(--border)); stroke-width: 1; stroke-dasharray: 2 3; }
  .wc-cone { fill: var(--accent); fill-opacity: .16; stroke: var(--accent); stroke-opacity: .4; stroke-width: 1; }
  .wc-dot { fill: var(--text-3); fill-opacity: .55; }
  .wc-trend { fill: none; stroke: var(--accent); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  .wc-now { fill: var(--accent); stroke: var(--surface-1, var(--bg)); stroke-width: 2; }
  .wc-key { margin: 6px 0 0; font-size: 11.5px; color: var(--text-3); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .k-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-3); opacity: .6; display: inline-block; }
  .k-line { width: 14px; height: 2.4px; border-radius: 2px; background: var(--accent); display: inline-block; margin-left: 6px; }
  .k-cone { width: 12px; height: 9px; border-radius: 2px; background: var(--accent); opacity: .25; display: inline-block; margin-left: 6px; }
</style>
