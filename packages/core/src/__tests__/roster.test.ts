import { describe, expect, it } from 'vitest';
import { gradeFromSheetName, guessField, hasHeaderRow, parseMappedRows, parseSmartRow } from '../roster';

// Shapes copied from the real ZCS export, with invented names and addresses.
describe('parseSmartRow (header-less ZCS export)', () => {
  it('handles full, first, last, preferred, grade, two guardians', () => {
    const r = parseSmartRow(['Sam Altena', 'Sam', 'Altena', 'Sammy', 'Preschool', 'kate.altena@example.com', 'Kate', 'Altena', 'rob@example.com', 'Rob', 'Altena']);
    expect(r).toEqual({ first: 'Sam', middle: undefined, last: 'Altena', preferred: 'Sammy', grade: 'Preschool', guardians: [
      { email: 'kate.altena@example.com', first: 'Kate', last: 'Altena' }, { email: 'rob@example.com', first: 'Rob', last: 'Altena' }] });
  });
  it('handles a middle name and a preferred name equal to the first name', () => {
    const r = parseSmartRow(['Rena Joy Bakker', 'Rena', 'Joy', 'Bakker', 'Rena', 'Preschool', 'b@example.com', 'Ben', 'Bakker']);
    expect(r?.middle).toBe('Joy');
    expect(r?.last).toBe('Bakker');
    expect(r?.preferred).toBeUndefined();
  });
  it('handles multi-word last names and guardian nicknames', () => {
    const r = parseSmartRow(['Jack Vander Ploeg', 'Jack', 'Vander Ploeg', '3rd', 'erin@example.com', 'Erin', 'Vander Ploeg', 'E']);
    expect(r?.last).toBe('Vander Ploeg');
    expect(r?.grade).toBe('3rd');
    expect(r?.guardians).toEqual([{ email: 'erin@example.com', first: 'Erin', last: 'Vander Ploeg' }]);
  });
  it('picks the guardian last name when a nickname sits between', () => {
    const r = parseSmartRow(['Mia Berg', 'Mia', 'Berg', 'Kindergarten', 'liz@example.com', 'Elizabeth', 'Liz', 'Berg']);
    expect(r?.guardians[0]).toEqual({ email: 'liz@example.com', first: 'Elizabeth', last: 'Berg' });
  });
  it('uses the sheet name when no grade column exists', () => {
    expect(parseSmartRow(['Ann Dekker', 'Ann', 'Dekker', 'a@example.com', 'Al', 'Dekker'], '2nd')?.grade).toBe('2nd');
  });
  it('skips blank rows', () => {
    expect(parseSmartRow(['', '', ''])).toBeNull();
  });
});

describe('mapped mode', () => {
  it('detects header rows and guesses fields', () => {
    expect(hasHeaderRow([['Student First', 'Student Last', 'Grade', 'Parent 1 Email']])).toBe(true);
    expect(hasHeaderRow([['Sam Altena', 'Sam', 'Altena', 'k@example.com']])).toBe(false);
    expect(guessField('Parent 1 Email')).toBe('g1_email');
    expect(guessField('Guardian 2 First Name')).toBe('g2_first');
    expect(guessField('Student ID')).toBe('sis_id');
    expect(guessField('Grade Level')).toBe('grade');
  });
  it('parses rows with a mapping and splits "Last, First" full names', () => {
    const rows = parseMappedRows([['Altena, Sam', '3rd', 'k@example.com']], ['full_name', 'grade', 'g1_email']);
    expect(rows[0]).toMatchObject({ first: 'Sam', last: 'Altena', grade: '3rd', guardians: [{ email: 'k@example.com', last: 'Altena' }] });
  });
  it('reads grades from tab names', () => {
    expect(gradeFromSheetName('3s and 4s')).toBe('3s and 4s');
    expect(gradeFromSheetName('Third Grade')).toBe('Third');
  });
});
