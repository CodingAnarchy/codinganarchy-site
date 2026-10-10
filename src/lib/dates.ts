import { SITE_TIMEZONE } from '../consts';

// Milliseconds the zone's wall clock is ahead of UTC at `date` (negative west of UTC).
function zoneOffsetMs(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, Number(value)]),
  );
  const wallClockAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wallClockAsUtc - (date.getTime() - date.getUTCMilliseconds());
}

// YAML reads a bare `2026-10-10` as midnight UTC, which is the previous evening in
// SITE_TIMEZONE. Treat exact UTC midnights as date-only and move them to local midnight.
export function localMidnightIfDateOnly(date: Date) {
  const isUtcMidnight =
    date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0;
  return isUtcMidnight ? new Date(date.getTime() - zoneOffsetMs(date, SITE_TIMEZONE)) : date;
}

export function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: SITE_TIMEZONE });
}
