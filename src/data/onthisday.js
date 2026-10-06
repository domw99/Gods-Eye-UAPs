/**
 * "On this day": the cases that happened on today's day of the year, by the
 * date as it was where the case happened (the first ten characters of the
 * case's date: 1952-07-19T…). The year is not compared, so a case from 1561
 * and one from 2019 can share a day.
 */
const monthDay = (iso) => {
  const m = /^-?\d{4}-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[1]}-${m[2]}` : '';
};

/** The cases (oldest first) whose day and month are those of `today` (a Date, read in the viewer's own time zone). */
export function onThisDay(cases, today = new Date()) {
  const key = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return cases.filter((c) => monthDay(c.date) === key).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
