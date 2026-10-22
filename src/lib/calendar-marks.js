/**
 * calendar-marks.js — what the Diary calendar shows for each day (fork). Pure.
 *
 *   completed : the day was closed out ("Day Complete")  → filled green dot
 *   logged    : the day has food logged but is not closed → hollow ring
 * A day is never both: completed wins, so the picker draws one mark per day.
 */
export function calendarMarks(rows) {
  const completed = new Set();
  const logged = new Set();
  for (const e of Array.isArray(rows) ? rows : []) {
    if (!e || !e.date) continue;
    if (e.completed_at) { completed.add(e.date); continue; }
    const items = Array.isArray(e.items) ? e.items : [];
    if (items.length > 0) logged.add(e.date);
  }
  return { completed, logged };
}
