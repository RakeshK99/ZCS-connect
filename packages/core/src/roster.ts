// Roster spreadsheet parsing for the console import wizard.
//
// Two modes:
//  1. Smart mode for header-less exports like the ZCS "Emails for Active Campaign"
//     sheet, where columns shift: full name, first, [middle], last, [preferred],
//     grade, then repeating guardian groups of email, first, last, [nickname].
//  2. Mapped mode for files with a header row: each column is mapped to a field.
import type { RosterRow } from './admin';

const GRADE_RE = /^(pre-?school|pre-?k|pk|ps|3s\s*(and|&)\s*4s|kinder(garten)?|kg?|(grade|gr\.?)\s*\d{1,2}|\d{1,2}(st|nd|rd|th)?(\s*grade)?|first|second|third|fourth|fifth|sixth|seventh|eighth)$/i;
const EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

export const isEmail = (s: string) => EMAIL_RE.test(s.trim());
export const looksLikeGrade = (s: string) => GRADE_RE.test(s.trim());

const clean = (cells: unknown[]) => cells.map((c) => (c == null ? '' : String(c).trim()));

/** Parse one header-less row. `fallbackGrade` is used when no grade cell exists (e.g. a tab named "3rd Grade"). */
export function parseSmartRow(raw: unknown[], fallbackGrade?: string): RosterRow | null {
  const cells = clean(raw);
  while (cells.length && !cells[cells.length - 1]) cells.pop();
  if (cells.length < 2 || !cells[0]) return null;

  let gi = cells.findIndex((c, i) => i >= 1 && looksLikeGrade(c));
  const firstEmail = cells.findIndex(isEmail);
  if (gi === -1 || (firstEmail !== -1 && gi > firstEmail)) gi = firstEmail === -1 ? cells.length : firstEmail;
  const names = cells.slice(0, gi).filter(Boolean);
  const grade = gi < cells.length && looksLikeGrade(cells[gi]!) ? cells[gi]! : (fallbackGrade ?? '');
  const full = names[0] ?? '';
  const fullTokens = full.split(/\s+/);
  const first = names[1] ?? fullTokens[0] ?? '';

  // last name = the first name-cell (after "first") that the full name ends with
  let li = -1;
  for (let i = 2; i < names.length; i++) {
    if (full.toLowerCase().endsWith(names[i]!.toLowerCase()) && names[i]!.toLowerCase() !== first.toLowerCase()) { li = i; break; }
  }
  let last: string, middle: string | undefined, preferred: string | undefined;
  if (li !== -1) {
    last = names[li]!;
    middle = names.slice(2, li).join(' ') || undefined;
    preferred = names[li + 1];
  } else if (names.length >= 3) {
    last = names[2]!;
    preferred = names[3];
  } else {
    last = fullTokens.length > 1 ? fullTokens.slice(1).join(' ') : '';
  }
  if (preferred && preferred.toLowerCase() === first.toLowerCase()) preferred = undefined;

  const guardians: RosterRow['guardians'] = [];
  const rest = cells.slice(gi + (grade && cells[gi] === grade ? 1 : 0));
  let cur: RosterRow['guardians'][number] | null = null;
  let extra: string[] = [];
  const flush = () => {
    if (!cur) return;
    cur.first = extra[0] || undefined;
    cur.last = (extra.length >= 3 && extra[2]!.toLowerCase() === last.toLowerCase() ? extra[2] : extra[1]) || last || undefined;
    guardians.push(cur);
  };
  for (const c of rest) {
    if (!c) continue;
    if (isEmail(c)) { flush(); cur = { email: c.toLowerCase() }; extra = []; }
    else if (cur) extra.push(c);
  }
  flush();

  if (!first || !last) return null;
  return { first, middle, last, preferred, grade, guardians };
}

export type RosterField =
  | 'ignore' | 'sis_id' | 'full_name' | 'first' | 'middle' | 'last' | 'preferred' | 'grade'
  | 'g1_email' | 'g1_first' | 'g1_last' | 'g1_relationship' | 'g2_email' | 'g2_first' | 'g2_last' | 'g2_relationship';

export const ROSTER_FIELDS: { id: RosterField; label: string }[] = [
  { id: 'ignore', label: '— Skip —' }, { id: 'sis_id', label: 'Student ID' }, { id: 'full_name', label: 'Student full name' },
  { id: 'first', label: 'Student first name' }, { id: 'middle', label: 'Student middle name' }, { id: 'last', label: 'Student last name' },
  { id: 'preferred', label: 'Preferred name' }, { id: 'grade', label: 'Grade' },
  { id: 'g1_email', label: 'Guardian 1 email' }, { id: 'g1_first', label: 'Guardian 1 first name' }, { id: 'g1_last', label: 'Guardian 1 last name' },
  { id: 'g1_relationship', label: 'Guardian 1 relationship' },
  { id: 'g2_email', label: 'Guardian 2 email' }, { id: 'g2_first', label: 'Guardian 2 first name' }, { id: 'g2_last', label: 'Guardian 2 last name' },
  { id: 'g2_relationship', label: 'Guardian 2 relationship' },
];

/** Guess a field from a header cell ("Parent 1 Email" → g1_email). */
export function guessField(header: string): RosterField {
  const h = header.toLowerCase().replace(/[_\-.]/g, ' ').replace(/\s+/g, ' ').trim();
  const g = /(parent|guardian|mother|father|contact)\s*(1|one|a)?\b/.test(h) && !/(2|two|\bb\b)/.test(h) ? 'g1'
    : /(parent|guardian|mother|father|contact)\s*(2|two|b)\b/.test(h) ? 'g2' : null;
  if (g) {
    if (/mail/.test(h)) return `${g}_email` as RosterField;
    if (/first/.test(h)) return `${g}_first` as RosterField;
    if (/last|surname/.test(h)) return `${g}_last` as RosterField;
    if (/relation/.test(h)) return `${g}_relationship` as RosterField;
  }
  if (/mail/.test(h)) return 'g1_email';
  if (/(student|sis|local)\s*id|^id$/.test(h)) return 'sis_id';
  if (/grade|level|class of/.test(h)) return 'grade';
  if (/prefer|nick/.test(h)) return 'preferred';
  if (/middle/.test(h)) return 'middle';
  if (/first/.test(h)) return 'first';
  if (/last|surname/.test(h)) return 'last';
  if (/name/.test(h)) return 'full_name';
  return 'ignore';
}

export function hasHeaderRow(rows: unknown[][]): boolean {
  const first = clean(rows[0] ?? []);
  return first.length > 0 && !first.some(isEmail) && first.filter((c) => /name|grade|email|parent|guardian|student/i.test(c)).length >= 2;
}

export function parseMappedRows(rows: unknown[][], mapping: RosterField[], fallbackGrade?: string): RosterRow[] {
  const out: RosterRow[] = [];
  for (const raw of rows) {
    const cells = clean(raw);
    const get = (f: RosterField) => { const i = mapping.indexOf(f); return i === -1 ? '' : cells[i] ?? ''; };
    let first = get('first'), last = get('last');
    const full = get('full_name');
    if ((!first || !last) && full) {
      const t = full.includes(',') ? full.split(',').map((s) => s.trim()).reverse().join(' ').split(/\s+/) : full.split(/\s+/);
      first ||= t[0] ?? '';
      last ||= t.slice(1).join(' ');
    }
    if (!first || !last) continue;
    const guardians = (['g1', 'g2'] as const).map((g) => ({
      email: get(`${g}_email`).toLowerCase(), first: get(`${g}_first`) || undefined, last: get(`${g}_last`) || last, relationship: get(`${g}_relationship`) || undefined,
    })).filter((x) => x.email);
    out.push({ sis_id: get('sis_id') || undefined, first, middle: get('middle') || undefined, last, preferred: get('preferred') || undefined,
      grade: get('grade') || fallbackGrade || '', guardians });
  }
  return out;
}

/** Sheet/tab names like "3s and 4s" or "Third Grade" double as the grade when rows lack one. */
export function gradeFromSheetName(name: string): string | undefined {
  const n = name.trim();
  if (looksLikeGrade(n)) return n;
  const m = n.match(/(pre-?school|kindergarten|3s\s*(and|&)\s*4s|\d{1,2}(st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth)/i);
  return m?.[0];
}
