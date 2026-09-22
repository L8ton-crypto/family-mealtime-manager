// All calendar maths works on YYYY-MM-DD strings, never on a Date read back
// via LOCAL getters. Internally, a string is parsed and any Date object is
// constructed via Date.UTC(...) and read back only via getUTC*/setUTC*
// methods — never getDate()/getMonth()/getDay() — so the local timezone of
// the machine running this code can never re-interpret midnight UTC as the
// previous or next local day and silently shift a calendar day. Every
// function here is a pure string -> string (or string -> X) transform;
// nothing reads `new Date()` in local time except todayISO(), which
// deliberately wants the CLIENT's own local "today" (a user planning at
// 11pm should see their own today, not UTC's).

const WEEKDAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const ISO_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

function parseISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

/**
 * True when iso is both shaped like YYYY-MM-DD and a REAL calendar date.
 * `Date.UTC` silently normalizes overflow — `Date.UTC(2026, 1, 30)` (Feb 30)
 * rolls over to March 2, and `Date.UTC(2027, 1, 29)` (Feb 29 in a
 * non-leap year) rolls over to March 1 — so shape alone lets an invalid
 * date like "2026-02-30" through. This round-trips the parsed components
 * through `Date.UTC` and rejects anything that doesn't come back exactly
 * unchanged. Every API boundary that accepts a caller-supplied date
 * (service_date, from/to, ?week) must call this, not just match the shape
 * regex, or an invalid date reaches the database as a silently-shifted
 * valid one (or, for a raw SQL date cast, a runtime error).
 */
export function isValidISODate(iso: string): boolean {
  if (!ISO_DATE_SHAPE.test(iso)) return false;
  const { y, m, d } = parseISO(iso);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function toUTCDate(iso: string): Date {
  const { y, m, d } = parseISO(iso);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The client's local "today" as YYYY-MM-DD. Deliberately local time, not UTC. */
export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** iso + n days (n may be negative). */
export function addDays(iso: string, n: number): string {
  const date = toUTCDate(iso);
  date.setUTCDate(date.getUTCDate() + n);
  return toISO(date);
}

/** The Monday of the week containing iso (Monday-Sunday weeks). */
export function startOfWeek(iso: string): string {
  const date = toUTCDate(iso);
  const day = date.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(iso, diff);
}

/** The 7 days (Monday first) of the week containing iso. */
export function weekDays(iso: string): string[] {
  const monday = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** True when a and b fall in the same Monday-Sunday week. */
export function isSameWeek(a: string, b: string): boolean {
  return startOfWeek(a) === startOfWeek(b);
}

/** e.g. "MON" */
export function formatWeekdayShort(iso: string): string {
  return WEEKDAY_ABBR[toUTCDate(iso).getUTCDay()];
}

/** e.g. "Tuesday" — full weekday name, sentence case. Slice 3's engine uses this for reasons like "Had it on Tuesday". */
export function formatWeekdayLong(iso: string): string {
  return WEEKDAY_FULL[toUTCDate(iso).getUTCDay()];
}

/** Calendar days between two YYYY-MM-DD dates (b - a). May be negative. */
export function daysBetween(a: string, b: string): number {
  const MS_PER_DAY = 86400000;
  return Math.round((toUTCDate(b).getTime() - toUTCDate(a).getTime()) / MS_PER_DAY);
}

/** e.g. "22 SEP" */
export function formatDayAndMonth(iso: string): string {
  const date = toUTCDate(iso);
  return `${date.getUTCDate()} ${MONTH_ABBR[date.getUTCMonth()]}`;
}

/** e.g. "MON 22" */
export function formatDayShort(iso: string): string {
  const date = toUTCDate(iso);
  return `${WEEKDAY_ABBR[date.getUTCDay()]} ${date.getUTCDate()}`;
}

/** e.g. "MON 22 SEP" */
export function formatDayLong(iso: string): string {
  const date = toUTCDate(iso);
  return `${WEEKDAY_ABBR[date.getUTCDay()]} ${date.getUTCDate()} ${MONTH_ABBR[date.getUTCMonth()]}`;
}

/** e.g. "WEEK OF MON 22 SEP 2026" — the Monday of the week containing iso. */
export function formatWeekKicker(iso: string): string {
  const monday = startOfWeek(iso);
  const date = toUTCDate(monday);
  return `WEEK OF ${WEEKDAY_ABBR[date.getUTCDay()]} ${date.getUTCDate()} ${MONTH_ABBR[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * e.g. "22 SEP 21:19" — formats a real timestamp (a `timestamptz`, not a
 * calendar-day string) such as "printed at". Unlike every other function in
 * this file, this one deliberately reads the local wall-clock components off
 * a real `Date` (getDate()/getMonth()/getHours()/getMinutes(), not the UTC
 * getters) — the same "show the viewer their own local time" rationale
 * todayISO() documents at the top of this file: someone printing the order
 * wants to see when THEY printed it, not the UTC instant. It reuses this
 * module's own MONTH_ABBR so the abbreviation ("SEP") is always identical to
 * every other date rendered in the app, rather than a locale-dependent
 * string like `toLocaleString('en-GB', { month: 'short' })` (which had
 * rendered "SEPT" on this machine, not "SEP" — see docs/slices/05-service.md).
 */
export function formatDateTimeStamp(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  const day = date.getDate();
  const month = MONTH_ABBR[date.getMonth()];
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${hh}:${mm}`;
}
