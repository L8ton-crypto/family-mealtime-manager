import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  formatDateTimeStamp,
  formatDayAndMonth,
  formatDayLong,
  formatDayShort,
  formatWeekdayLong,
  formatWeekdayShort,
  formatWeekKicker,
  isSameWeek,
  isValidISODate,
  startOfWeek,
  todayISO,
  weekDays,
} from './dates';

// Independent day-of-week check via Zeller's congruence (Gregorian
// calendar) — deliberately NOT reusing any logic from dates.ts, so these
// tests verify dates.ts's Monday-start-of-week maths against a completely
// separate algorithm rather than against itself. Returns the JS Date
// convention (0 = Sunday .. 6 = Saturday).
function zellerJsWeekday(y: number, m: number, d: number): number {
  let year = y;
  let month = m;
  if (month < 3) {
    month += 12;
    year -= 1;
  }
  const K = year % 100;
  const J = Math.floor(year / 100);
  const h = (d + Math.floor((13 * (month + 1)) / 5) + K + Math.floor(K / 4) + Math.floor(J / 4) + 5 * J) % 7;
  return (h + 6) % 7; // Zeller's 0=Sat..6=Fri -> JS 0=Sun..6=Sat
}

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return zellerJsWeekday(y, m, d);
}

describe('dates.ts, cross-checked against an independent Zeller\'s congruence implementation', () => {
  it('sanity check: the fixed "today" anchor (2026-09-22) really is a Tuesday', () => {
    expect(weekdayOf('2026-09-22')).toBe(2);
  });

  describe('startOfWeek', () => {
    it('returns the same Monday for every day Mon-Sun of a known week', () => {
      const week = [
        '2026-09-21',
        '2026-09-22',
        '2026-09-23',
        '2026-09-24',
        '2026-09-25',
        '2026-09-26',
        '2026-09-27',
      ];
      for (const iso of week) {
        expect(startOfWeek(iso)).toBe('2026-09-21');
      }
    });

    it('handles Sunday by returning the Monday six days earlier (Mon-Sun week, not Sun-first)', () => {
      const sunday = '2026-09-27';
      expect(weekdayOf(sunday)).toBe(0);
      expect(startOfWeek(sunday)).toBe('2026-09-21');
    });

    it('crosses a month boundary (the Monday of the week can fall in the previous month)', () => {
      const iso = '2026-09-01';
      expect(weekdayOf(iso)).not.toBe(1); // confirm independently it's not itself a Monday
      const monday = startOfWeek(iso);
      expect(weekdayOf(monday)).toBe(1); // independently confirm the result IS a Monday
      expect(monday < iso).toBe(true);
      expect(monday.slice(0, 7)).not.toBe(iso.slice(0, 7)); // different YYYY-MM
      expect(monday).toBe('2026-08-31');
    });

    it('crosses a year boundary (the Monday of the week containing Jan 1 can fall in the previous year)', () => {
      const iso = '2027-01-01';
      const monday = startOfWeek(iso);
      expect(weekdayOf(monday)).toBe(1);
      expect(monday.slice(0, 4)).toBe('2026');
      expect(monday).toBe('2026-12-28');
    });

    it('is idempotent: startOfWeek of a Monday is itself', () => {
      expect(startOfWeek('2026-09-21')).toBe('2026-09-21');
    });
  });

  describe('weekDays', () => {
    it('returns the 7 days Monday-first for a week crossing a month boundary', () => {
      expect(weekDays('2026-09-02')).toEqual([
        '2026-08-31',
        '2026-09-01',
        '2026-09-02',
        '2026-09-03',
        '2026-09-04',
        '2026-09-05',
        '2026-09-06',
      ]);
    });

    it('every returned day is independently confirmed Mon..Sun in order', () => {
      const days = weekDays('2026-09-22');
      days.forEach((iso, i) => {
        expect(weekdayOf(iso)).toBe(i === 6 ? 0 : i + 1);
      });
    });
  });

  describe('isSameWeek', () => {
    it('is true for two days in the same Mon-Sun week', () => {
      expect(isSameWeek('2026-09-21', '2026-09-27')).toBe(true);
    });

    it('is false across a week boundary (Sunday vs the following Monday)', () => {
      expect(isSameWeek('2026-09-27', '2026-09-28')).toBe(false);
    });
  });

  describe('addDays', () => {
    it('adds and subtracts days, crossing month/year boundaries correctly', () => {
      expect(addDays('2026-09-22', 10)).toBe('2026-10-02');
      expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
      expect(addDays('2026-09-22', 0)).toBe('2026-09-22');
    });
  });

  describe('formatters', () => {
    it('formatWeekdayShort', () => {
      expect(formatWeekdayShort('2026-09-22')).toBe('TUE');
    });

    it('formatDayAndMonth', () => {
      expect(formatDayAndMonth('2026-09-22')).toBe('22 SEP');
    });

    it('formatDayShort', () => {
      expect(formatDayShort('2026-09-22')).toBe('TUE 22');
    });

    it('formatDayLong', () => {
      expect(formatDayLong('2026-09-22')).toBe('TUE 22 SEP');
    });

    it('formatWeekKicker uses the Monday of the given date\'s week, not the date itself', () => {
      expect(formatWeekKicker('2026-09-22')).toBe('WEEK OF MON 21 SEP 2026');
    });

    it('formatWeekKicker on a year-boundary week', () => {
      expect(formatWeekKicker('2027-01-01')).toBe('WEEK OF MON 28 DEC 2026');
    });
  });

  describe('todayISO', () => {
    it('matches the local date components of `new Date()`, in YYYY-MM-DD form', () => {
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate()
      ).padStart(2, '0')}`;
      expect(todayISO()).toBe(expected);
      expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('isValidISODate', () => {
    it.each([
      ['2026-02-30', 'February has no 30th'],
      ['2026-13-01', 'month 13 does not exist'],
      ['2027-02-29', '2027 is not a leap year'],
      ['2026-00-15', 'month 0 does not exist'],
      ['2026-04-31', 'April has 30 days'],
      ['2026-09-2', 'day not zero-padded'],
      ['2026-9-22', 'month not zero-padded'],
      ['26-09-22', 'year not 4 digits'],
      ['2026/09/22', 'wrong separator'],
      ['not-a-date', 'not a date at all'],
      ['', 'empty string'],
    ])('rejects %s (%s)', (input) => {
      expect(isValidISODate(input)).toBe(false);
    });

    it.each([
      ['2028-02-29', '2028 is a leap year'],
      ['2026-12-31', 'last day of a normal year'],
      ['2026-01-01', 'first day of a normal year'],
      ['2026-09-22', 'the fixed today anchor'],
      ['2000-02-29', '2000 is a leap year (divisible by 400)'],
    ])('accepts %s (%s)', (input) => {
      expect(isValidISODate(input)).toBe(true);
    });

    it('rejects 1900-02-29 (1900 is NOT a leap year — divisible by 100 but not 400)', () => {
      expect(isValidISODate('1900-02-29')).toBe(false);
    });
  });
});

// Slice 3 additions: formatWeekdayLong / daysBetween, used by src/lib/engine/score.ts.
describe('formatWeekdayLong', () => {
  it('returns the full sentence-case weekday name', () => {
    expect(formatWeekdayLong('2026-09-22')).toBe('Tuesday'); // fixed today anchor
    expect(formatWeekdayLong('2026-09-20')).toBe('Sunday');
    expect(formatWeekdayLong('2026-09-26')).toBe('Saturday');
  });
});

// Carry-over fix (Slice 5 review): the receipt's "PRINTED" line used to go
// through `toLocaleString('en-GB', { month: 'short' })`, which rendered
// "SEPT" (not "SEP") on the machine this was built on. formatDateTimeStamp
// reuses dates.ts's own MONTH_ABBR instead, so it's byte-for-byte consistent
// with every other date in the app. It reads real local wall-clock getters
// (like todayISO does), so the expected value here is built the same way,
// rather than hard-coding a value that would only be correct in one timezone.
describe('formatDateTimeStamp', () => {
  const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  function expectedFor(isoDateTime: string): string {
    const date = new Date(isoDateTime);
    const day = date.getDate();
    const month = MONTH_ABBR[date.getMonth()];
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${hh}:${mm}`;
  }

  it('formats a September timestamp using "SEP", never "SEPT"', () => {
    const iso = '2026-09-22T21:19:00.000Z';
    const result = formatDateTimeStamp(iso);
    expect(result).toBe(expectedFor(iso));
    expect(result).toContain('SEP');
    expect(result).not.toContain('SEPT');
  });

  it('pads single-digit hours and minutes', () => {
    const iso = '2026-01-05T03:05:00.000Z';
    expect(formatDateTimeStamp(iso)).toBe(expectedFor(iso));
  });

  it('reads local wall-clock time, matching a plain `new Date()` on this machine', () => {
    const iso = '2026-12-31T23:59:00.000Z';
    expect(formatDateTimeStamp(iso)).toBe(expectedFor(iso));
  });
});

describe('daysBetween', () => {
  it('is 0 for the same date', () => {
    expect(daysBetween('2026-09-22', '2026-09-22')).toBe(0);
  });
  it('is positive when b is after a', () => {
    expect(daysBetween('2026-09-22', '2026-09-25')).toBe(3);
  });
  it('is negative when b is before a', () => {
    expect(daysBetween('2026-09-22', '2026-09-15')).toBe(-7);
  });
  it('crosses a month boundary correctly', () => {
    expect(daysBetween('2026-09-25', '2026-10-02')).toBe(7);
  });
});
