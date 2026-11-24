import { describe, expect, it } from 'vitest';
import { classListFromParentRows, isParentPerRow, parseParentRows, teacherFromParentRows } from '../index';

// Invented names. Same layout as a school's "one row per parent" contact sheet.
const sheet = [
  ['Email', 'First Name', 'Last Name', 'Student 1 First', 'Student 1 Last', 'Student 2 First', 'Student 2 Last Name', '', 'Teacher First Name', 'Teacher Last Name', 'Grade', 'Teacher Email'],
  ['ann.berg@example.com', 'Ann', 'Berg', 'Mila', 'Berg', '', '', '', 'Rosa', 'Lindqvist', '2nd', 'rlindqvist@school.test'],
  ['tom.berg@example.com', 'Tom', 'Berg', 'Mila', 'Berg'],
  ['KIM@Example.com', 'Kim', 'Oakes', 'Ben', 'Oakes', 'Ada', 'Oakes'],
  ['lee.oakes@example.com', 'Lee', 'Oakes', 'Ada', 'Oakes', 'Ben', 'Oakes'],
  ['jo.van@example.com', 'Jo', 'Van Dam', 'Pia', 'VanDam'],
  ['', 'No', 'Email', 'Sam', 'Quiet'],
];

describe('one row per parent', () => {
  it('recognises the layout and ignores ordinary family lists', () => {
    expect(isParentPerRow(sheet[0]!)).toBe(true);
    expect(isParentPerRow(['Student ID', 'First Name', 'Last Name', 'Grade', 'Parent 1 Email'])).toBe(false);
  });

  it('turns parents into one row per child, merging siblings and both parents', () => {
    const rows = parseParentRows(sheet);
    expect(rows.map((r) => `${r.first} ${r.last}`)).toEqual(['Mila Berg', 'Ben Oakes', 'Ada Oakes', 'Pia VanDam', 'Sam Quiet']);
    expect(rows.find((r) => r.first === 'Mila')!.guardians.map((g) => g.email)).toEqual(['ann.berg@example.com', 'tom.berg@example.com']);
    expect(rows.find((r) => r.first === 'Ada')!.guardians.map((g) => g.email)).toEqual(['kim@example.com', 'lee.oakes@example.com']);
    expect(rows.find((r) => r.first === 'Sam')!.guardians).toEqual([]);
  });

  it('uses the grade written once in the teacher block for every child', () => {
    expect(parseParentRows(sheet).every((r) => r.grade === '2nd')).toBe(true);
  });

  it('reads the teacher block and builds a class list from it', () => {
    expect(teacherFromParentRows(sheet)).toEqual({ email: 'rlindqvist@school.test', first: 'Rosa', last: 'Lindqvist', grade: '2nd' });
    const cls = classListFromParentRows(sheet);
    expect(cls).toHaveLength(5);
    expect(cls[0]).toMatchObject({ class_code: '2-LINDQVIST', class_name: '2nd grade · Lindqvist', teacher_emails: ['rlindqvist@school.test'], student_first: 'Mila', student_last: 'Berg' });
  });

  it('has no class list when the sheet names no teacher', () => {
    expect(classListFromParentRows(sheet.map((r) => r.slice(0, 7)))).toEqual([]);
  });
});
