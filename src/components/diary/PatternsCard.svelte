<!--
  PatternsCard (fork): "What I've noticed". Habits that go with eating less or more over a
  day, found in your own diary (see lib/patterns.js for the rules). Each one says how many
  days it rests on and is worded as a tendency, never a cause. Shows nothing until there is
  something real to say; switch it off in Settings → Goals.
-->
<script>
  import { onMount } from 'svelte';
  import { loadProgressData } from '../../lib/progress-data.js';
  import { findPatterns } from '../../lib/patterns.js';
  import { goals, showPatterns, smartSuggestions } from '../../stores/settings.js';

  let result = null;
  onMount(async () => {
    if (!$showPatterns || !$smartSuggestions) return;
    const { days } = await loadProgressData();
    result = findPatterns({ days, calorieGoal: $goals?.calories?.max ?? null, limit: 4 });
  });
  const icon = (k) => (k === 'eat-less' || k === 'breakfast-less' ? 'trending_down' : k === 'over' ? 'priority_high' : 'trending_up');
</script>

{#if $showPatterns && $smartSuggestions && result && (result.patterns.length || result.daysUsed < 14)}
  <div class="card pt" data-testid="patterns-card">
    <div class="pt-head"><span class="material-symbols-rounded pt-icon" aria-hidden="true">insights</span><div class="pt-title">What I've noticed</div></div>
    {#if result.patterns.length}
      <ul class="pt-list">
        {#each result.patterns as p (p.kind + (p.food || p.weekday || ''))}
          <li class="pt-row">
            <span class="material-symbols-rounded pt-ico" class:good={p.kind === 'eat-less' || p.kind === 'breakfast-less'} aria-hidden="true">{icon(p.kind)}</span>
            <span class="pt-body">
              <span class="pt-text">{p.text}</span>
              <span class="pt-sub">Based on {p.n} days with it and {p.nOther} without{p.strength === 'hint' ? ' · a hint, not a certainty' : ''}.</span>
            </span>
          </li>
        {/each}
      </ul>
      <p class="pt-foot">These are patterns in your own diary, not proof that one thing causes another.</p>
    {:else}
      <p class="pt-sub">Patterns show up after a couple of weeks of logging. {result.daysUsed} full days so far.</p>
    {/if}
  </div>
{/if}

<style>
  .pt { margin-bottom: 12px; padding: 14px 16px; }
  .pt-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .pt-icon { color: var(--accent); font-size: 22px; }
  .pt-title { font-weight: 700; }
  .pt-list { list-style: none; margin: 0; padding: 0; }
  .pt-row { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .pt-row:last-child { border-bottom: 0; }
  .pt-ico { width: 34px; height: 34px; flex-shrink: 0; border-radius: 50%; background: rgba(234, 179, 8, .16); color: #eab308; display: flex; align-items: center; justify-content: center; font-size: 20px; }
  .pt-ico.good { background: var(--accent-dim); color: var(--accent); }
  .pt-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .pt-text { font-size: 14.5px; line-height: 1.4; }
  .pt-sub { font-size: 12.5px; line-height: 1.4; color: var(--text-3); }
  .pt-foot { margin: 8px 0 0; font-size: 12px; color: var(--text-3); }
</style>
