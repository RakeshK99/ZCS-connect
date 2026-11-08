import { describe, expect, it } from 'vitest';
import { guessClassField, parseClassListRows } from '../classlists';

describe('class lists', () => {
  it('guesses common FACTS-style headers', () => {
    expect(['Section Code', 'Course Name', 'Teacher Email', 'Student ID', 'Grade Level', 'First Name', 'Last Name', 'Student', 'Room']
      .map(guessClassField)).toEqual(['class_code', 'class_name', 'teacher_email', 'student_id', 'grade', 'student_first', 'student_last', 'student_name', 'ignore']);
  });
  it('reads rows, splits "Last, First" names and collects every teacher email', () => {
    const rows = parseClassListRows([
      ['7MATH-A', 'Math 7', 'Jane Doe <JDoe@zcs.org>; aide@zcs.org', '1001', 'VanDyke, Emma'],
      ['', 'No class', 'x@zcs.org', '1002', 'Skip, Me'],
    ], ['class_code', 'class_name', 'teacher_email', 'student_id', 'student_name']);
    expect(rows).toEqual([{ class_code: '7MATH-A', class_name: 'Math 7', grade: undefined, teacher_emails: ['jdoe@zcs.org', 'aide@zcs.org'],
      student_sis_id: '1001', student_first: 'Emma', student_last: 'VanDyke' }]);
  });
});
