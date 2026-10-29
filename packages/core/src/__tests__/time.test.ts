import { describe, expect, it } from 'vitest';
import { parseTimeInput } from '../format';

describe('parseTimeInput', () => {
  it.each([
    ['9', '09:00'], ['9:30', '09:30'], ['9am', '09:00'], ['9:30 a.m.', '09:30'], ['2:15 PM', '14:15'], ['2', '14:00'],
    ['12pm', '12:00'], ['12 am', '00:00'], ['14:00', '14:00'], ['1430', '14:30'], ['7', '07:00'],
  ])('reads %s as %s', (input, out) => expect(parseTimeInput(input)).toBe(out));
  it.each(['', 'noon', '25:00', '9:75', '13pm', '0am'])('rejects %s', (input) => expect(parseTimeInput(input)).toBeNull());
});
