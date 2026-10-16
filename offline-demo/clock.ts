const BASE = '2026-10-13T23:00:00.000Z'; // 14 Oct 2026, 10:00 Australia/Sydney (UTC+11).
const DAY = 86_400_000;
let instant = Date.parse(BASE);
export const clock = {
  now: () => new Date(instant).toISOString(),
  tick: (seconds: number) => {instant += Math.round(seconds * 1000); return new Date(instant).toISOString();},
  today: (timezone = 'Australia/Sydney') => {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(instant));
    const part = (key: string) => parts.find(p => p.type === key)!.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  },
  advance: (days: number) => { if (!Number.isInteger(days) || days < 0 || days > 366) throw new Error('Choose a demo clock advance between 0 and 366 days.'); instant += days * DAY; },
  jumpPast: (date: string) => { const target = Date.parse(`${date}T23:00:00.000Z`); if (!Number.isFinite(target)) throw new Error('No confirmed deadline to jump past.'); instant = Math.max(instant, target); },
  reset: () => {instant = Date.parse(BASE);},
};
export function addDays(date: string, days: number) { return new Date(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10); }
export function dayDifference(end: string, start: string) {return Math.floor((Date.parse(`${end.slice(0,10)}T00:00:00Z`) - Date.parse(`${start.slice(0,10)}T00:00:00Z`)) / DAY);}
export function localDate(instant: string, timezone = 'Australia/Sydney') {
  return new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(instant));
}
