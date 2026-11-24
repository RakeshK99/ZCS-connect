// Class list spreadsheets for the console "Class lists" import: one row per
// student per class or section, e.g. a FACTS "class roster" export or a sheet
// ZCS drops in the shared Drive folder before each semester.
import { parseParentRows, teacherFromParentRows } from './roster';

export type ClassListField =
  | 'class_code' | 'class_name' | 'grade' | 'teacher_email' | 'student_id'
  | 'student_first' | 'student_last' | 'student_name' | 'ignore';

export interface ClassListRow {
  class_code: string;
  class_name?: string;
  grade?: string;
  teacher_emails: string[];
  student_sis_id?: string;
  student_first?: string;
  student_last?: string;
}

const EMAIL_RE = /[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+/g;

/** Guess what a header cell holds ("Section Code" → class_code, "Teacher Email" → teacher_email). */
export function guessClassField(header: string): ClassListField {
  const h = header.toLowerCase().replace(/[_\-.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/teacher|instructor|staff/.test(h)) return 'teacher_email';
  if (/(class|section|course|homeroom)\s*(code|id|number|#)|^(section|course|class|homeroom)$/.test(h)) return 'class_code';
  if (/(class|section|course)\s*(name|title|description)/.test(h)) return 'class_name';
  if (/(student|sis|local|person)\s*id|^id$/.test(h)) return 'student_id';
  if (/grade|level/.test(h)) return 'grade';
  if (/first|given/.test(h)) return 'student_first';
  if (/last|surname|family name/.test(h)) return 'student_last';
  if (/name|student/.test(h)) return 'student_name';
  return 'ignore';
}

/** Turn spreadsheet rows (header row already removed) into import rows. Rows without a class are skipped. */
export function parseClassListRows(rows: unknown[][], mapping: ClassListField[]): ClassListRow[] {
  const out: ClassListRow[] = [];
  for (const raw of rows) {
    const cells = raw.map((c) => (c == null ? '' : String(c).trim()));
    const all = (f: ClassListField) => mapping.flatMap((m, i) => (m === f ? [cells[i] ?? ''] : [])).filter(Boolean);
    const one = (f: ClassListField) => all(f)[0] ?? '';
    const code = one('class_code');
    if (!code) continue;
    let first = one('student_first'), last = one('student_last');
    const full = one('student_name');
    if ((!first || !last) && full) {
      const t = full.includes(',') ? full.split(',').map((s) => s.trim()).reverse().join(' ').split(/\s+/) : full.split(/\s+/);
      first ||= t[0] ?? '';
      last ||= t.slice(1).join(' ');
    }
    const teacher_emails = [...new Set(all('teacher_email').flatMap((v) => v.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))];
    out.push({
      class_code: code, class_name: one('class_name') || undefined, grade: one('grade') || undefined, teacher_emails,
      student_sis_id: one('student_id') || undefined, student_first: first || undefined, student_last: last || undefined,
    });
  }
  return out;
}

/**
 * A one-row-per-parent family list that names its teacher (Teacher Email, plus grade
 * and name) doubles as a class list: every child on it goes in that teacher's class.
 * The class code is grade + teacher's last name, e.g. "2-VARGAS".
 */
export function classListFromParentRows(rows: unknown[][]): ClassListRow[] {
  const t = teacherFromParentRows(rows);
  if (!t) return [];
  const gradeNum = (t.grade ?? '').match(/\d+/)?.[0] ?? (/^k/i.test(t.grade ?? '') ? 'K' : '');
  const surname = (t.last ?? t.email.split('@')[0] ?? 'CLASS').replace(/[^a-z]/gi, '').toUpperCase();
  const code = [gradeNum, surname].filter(Boolean).join('-');
  const name = [t.grade ? `${t.grade} grade`.replace(/grade grade/i, 'grade') : '', t.last ? t.last : ''].filter(Boolean).join(' · ') || code;
  return parseParentRows(rows).map((s) => ({
    class_code: code, class_name: name, grade: t.grade, teacher_emails: [t.email], student_first: s.first, student_last: s.last,
  }));
}
