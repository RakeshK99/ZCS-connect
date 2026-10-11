import { describe, expect, it } from 'vitest';
import { childrenPossessive, initials, isoDay, parseIsoDay, pct, relativeTime, timeOfDay } from '../index';

describe('format', () => {
  it('builds initials without honorifics', () => {
    expect(initials('Mrs. Jennifer Smith')).toBe('JS');
    expect(initials('Sarah VanDyke')).toBe('SV');
  });
  it('round-trips local days', () => {
    expect(isoDay(parseIsoDay('2026-10-23'))).toBe('2026-10-23');
  });
  it('formats times of day', () => {
    expect(timeOfDay('06:30:00')).toBe('6:30 AM');
    expect(timeOfDay('18:30')).toBe('6:30 PM');
  });
  it('shows relative times', () => {
    const now = new Date(2026, 9, 20, 9, 41);
    expect(relativeTime(new Date(2026, 9, 19, 12).toISOString(), now)).toBe('Yesterday');
    expect(relativeTime(new Date(2026, 9, 1).toISOString(), now)).toBe('Oct 1');
  });
  it('computes percentages safely', () => {
    expect(pct(18, 24)).toBe(75);
    expect(pct(1, 0)).toBe(0);
  });
  it('joins children names for copy', () => {
    const c = { key: 'parent' as const, label: '', children: [
      { id: '1', first_name: 'Emma', name: 'Emma', last_name: 'V', grade: null, grade_id: null, division_id: null, teacher: null },
      { id: '2', first_name: 'Noah', name: 'Noah', last_name: 'V', grade: null, grade_id: null, division_id: null, teacher: null }] };
    expect(childrenPossessive(c)).toBe("Emma's and Noah's");
  });
});
