import { describe, expect, it } from 'vitest';
import { dayChipId, parseDayChipId, parseRailId, parseTicketId, railId, ticketId } from './dragTargets';

describe('railId / parseRailId', () => {
  it('round-trips a day and slot', () => {
    expect(railId('2026-09-23', 'dinner')).toBe('rail:2026-09-23:dinner');
    expect(parseRailId('rail:2026-09-23:dinner')).toEqual({ day: '2026-09-23', slot: 'dinner' });
  });

  it('accepts every meal type', () => {
    for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
      expect(parseRailId(railId('2026-01-01', slot))).toEqual({ day: '2026-01-01', slot });
    }
  });

  it('rejects a non-rail id', () => {
    expect(parseRailId('daychip:2026-09-23')).toBeNull();
    expect(parseRailId('ticket:5')).toBeNull();
  });

  it('rejects a malformed slot', () => {
    expect(parseRailId('rail:2026-09-23:brunch')).toBeNull();
  });

  it('rejects a malformed date', () => {
    expect(parseRailId('rail:26-09-23:dinner')).toBeNull();
    expect(parseRailId('rail:2026-9-23:dinner')).toBeNull();
  });
});

describe('dayChipId / parseDayChipId', () => {
  it('round-trips a day', () => {
    expect(dayChipId('2026-09-25')).toBe('daychip:2026-09-25');
    expect(parseDayChipId('daychip:2026-09-25')).toEqual({ day: '2026-09-25' });
  });

  it('rejects a non-day-chip id', () => {
    expect(parseDayChipId('rail:2026-09-23:dinner')).toBeNull();
  });
});

describe('ticketId / parseTicketId', () => {
  it('round-trips an entry id', () => {
    expect(ticketId(42)).toBe('ticket:42');
    expect(parseTicketId('ticket:42')).toBe(42);
  });

  it('rejects a non-ticket id', () => {
    expect(parseTicketId('rail:2026-09-23:dinner')).toBeNull();
  });

  it('rejects zero, negative or non-integer ids', () => {
    expect(parseTicketId('ticket:0')).toBeNull();
    expect(parseTicketId('ticket:-3')).toBeNull();
    expect(parseTicketId('ticket:3.5')).toBeNull();
  });
});
