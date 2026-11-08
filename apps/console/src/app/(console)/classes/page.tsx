'use client';
// Semester class lists: one row per student per class or section, with the
// teacher's school email. 1 Upload → 2 Check columns → 3 Preview → 4 Done.
// Each class in the file is made to match it; classes not in the file are left alone.
// Families come from Roster import; this page only places students in classes.
import { useMutation } from '@tanstack/react-query';
import { admin, guessClassField, parseClassListRows, type ClassListField, type ClassListResult, type ClassListRow } from '@zcs/core';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, ErrorNote, PageHeader, SectionTitle, Select, cx } from '@/components/ui';
import { readSpreadsheet, type Sheet } from '@/lib/sheets';
import { supabase } from '@/lib/supabase';

const STEPS = ['Upload', 'Check columns', 'Preview changes', 'Done'];
const FIELDS: { id: ClassListField; label: string }[] = [
  { id: 'class_code', label: 'Class or section code' },
  { id: 'class_name', label: 'Class name' },
  { id: 'teacher_email', label: 'Teacher email' },
  { id: 'student_id', label: 'Student ID' },
  { id: 'student_first', label: 'Student first name' },
  { id: 'student_last', label: 'Student last name' },
  { id: 'student_name', label: 'Student full name' },
  { id: 'grade', label: 'Grade' },
  { id: 'ignore', label: "Don't import" },
];

export default function ClassLists() {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<ClassListField[]>([]);
  const [rows, setRows] = useState<ClassListRow[]>([]);
  const [preview, setPreview] = useState<ClassListResult | null>(null);
  const [result, setResult] = useState<ClassListResult | null>(null);
  const [error, setError] = useState<unknown>(null);

  // every tab of a workbook, using the first tab's column layout
  const [all, setAll] = useState<Sheet[]>([]);
  const build = (tabs: Sheet[], map: ClassListField[]) => tabs.flatMap((t) => parseClassListRows(t.rows.slice(1), map));

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const tabs = (await readSpreadsheet(file)).filter((x) => x.rows.length > 1);
      if (!tabs.length) throw new Error('That file looks empty. It needs a header row and at least one student.');
      const map = tabs[0]!.rows[0]!.map((h) => guessClassField(String(h)));
      setFileName(file.name); setSheet(tabs[0]!); setAll(tabs); setMapping(map); setRows(build(tabs, map)); setStep(1);
    } catch (e) { setError(e); }
  };

  const previewM = useMutation({
    mutationFn: () => admin.importClassLists(supabase, rows, false),
    onSuccess: (p) => { setPreview(p); setStep(2); },
    onError: setError,
  });
  const applyM = useMutation({
    mutationFn: () => admin.importClassLists(supabase, rows, true),
    onSuccess: (r) => { setResult(r); setStep(3); },
    onError: setError,
  });
  const reset = () => { setStep(0); setSheet(null); setAll([]); setRows([]); setPreview(null); setResult(null); setError(null); };
  const classes = new Set(rows.map((r) => r.class_code.toUpperCase())).size;
  const missingCols = !mapping.includes('class_code') ? 'a class or section code'
    : !mapping.includes('student_id') && !mapping.includes('student_name') && !(mapping.includes('student_first') && mapping.includes('student_last')) ? 'the student (ID or name)' : null;

  return (
    <>
      <PageHeader title="Class lists" sub="Before each semester, upload who is in each class or section. Teachers can still add or remove a student during the semester in the app." />
      <ol className="flex gap-2 mb-6 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className={cx('px-3 py-1.5 rounded-full', i === step ? 'bg-navy text-white' : i < step ? 'bg-okbg text-ok' : 'bg-sf2 text-tx2')}>{i + 1}. {s}</li>
        ))}
      </ol>
      <ErrorNote error={error} />

      {step === 0 ? (
        <Card className="p-10 space-y-6">
          <label className="flex flex-col items-center gap-3 border-2 border-dashed border-bds rounded-2xl py-14 cursor-pointer hover:bg-bg">
            <Upload className="size-8 text-navy" />
            <span className="font-heading font-bold text-lg">Choose a class list spreadsheet</span>
            <span className="text-sm text-tx2 text-center max-w-md">One row per student per class: class or section code, teacher email, and the student&apos;s ID or name. Excel or a CSV from Google Sheets; extra columns are fine.</span>
            <input type="file" accept=".csv,.xlsx,.xlsm,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <div className="text-sm text-tx2 space-y-1">
            <p><b>Example:</b> Section Code · Course Name · Teacher Email · Student ID · Student Name</p>
            <p>7MATH-A · Math 7 · jdoe@zcs.org · 1001 · VanDyke, Emma</p>
            <p>Students must already be on the school list (Roster import). Middle school: list every section, so each teacher reaches the students in their sections.</p>
          </div>
        </Card>
      ) : null}

      {step === 1 && sheet ? (
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <FileSpreadsheet className="size-5 text-navy" /><span className="font-semibold">{fileName}</span>
            <Badge>{all.length} tab{all.length === 1 ? '' : 's'}</Badge><Badge>{rows.length} rows</Badge><Badge>{classes} classes</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead><tr>{sheet.rows[0]!.map((h, i) => (
                <th key={i} className="p-1.5 text-left align-bottom">
                  <div className="text-xs text-tx2 mb-1 font-normal">{h}</div>
                  <Select value={mapping[i] ?? 'ignore'} onChange={(e) => {
                    const m = [...mapping]; m[i] = e.target.value as ClassListField; setMapping(m); setRows(build(all, m));
                  }} className="h-9 text-sm">{FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                </th>))}</tr></thead>
              <tbody>{sheet.rows.slice(1, 4).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="p-1.5 text-tx2 whitespace-nowrap">{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {missingCols ? <p className="text-sm text-emergency">Pick the column that holds {missingCols}.</p> : null}
          <SectionTitle>How the first rows were read</SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-bd">
            <table className="w-full text-sm">
              <thead className="bg-sf2 text-left text-tx2"><tr><th className="p-2">Class</th><th className="p-2">Teacher</th><th className="p-2">Student</th></tr></thead>
              <tbody>{rows.slice(0, 8).map((r, i) => (
                <tr key={i} className="border-t border-bd">
                  <td className="p-2">{r.class_code}{r.class_name ? ` · ${r.class_name}` : ''}</td>
                  <td className="p-2">{r.teacher_emails.join(', ') || <span className="text-tx2">none listed</span>}</td>
                  <td className="p-2">{[r.student_first, r.student_last].filter(Boolean).join(' ') || r.student_sis_id}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button loading={previewM.isPending} disabled={!rows.length || !!missingCols} onClick={() => previewM.mutate()}>Preview changes for {classes} classes</Button>
            <Button variant="secondary" onClick={reset}>Choose a different file</Button>
          </div>
        </Card>
      ) : null}

      {step === 2 && preview ? (
        <Card className="p-6 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[['New classes', preview.classes_new], ['Updated classes', preview.classes_updated], ['Students added to classes', preview.students_added], ['Students taken off classes', preview.students_removed],
              ['New teacher accounts', preview.staff_new], ['Teachers added to classes', preview.teacher_links_added], ['Teachers taken off classes', preview.teacher_links_ended]].map(([l, n]) => (
              <div key={l as string} className="rounded-xl bg-bg p-4"><div className="text-sm text-tx2">{l}</div><div className="font-heading font-bold text-2xl">{n}</div></div>
            ))}
          </div>
          <p className="text-[15px] text-tx2">Each class in this file will match it exactly. Classes that aren&apos;t in the file don&apos;t change.</p>
          {preview.not_school_emails.length ? (
            <div className="flex gap-2 rounded-xl bg-maize/25 p-4 text-sm"><AlertTriangle className="size-5 shrink-0" />
              <div>These teacher emails aren&apos;t school addresses and were skipped: <b>{preview.not_school_emails.join(', ')}</b>.</div></div>
          ) : null}
          {preview.unmatched.length ? (
            <details className="rounded-xl bg-sf2 p-4 text-sm" open={preview.unmatched.length <= 10}>
              <summary className="cursor-pointer font-semibold">{preview.unmatched.length} rows couldn&apos;t be matched to a student (they&apos;ll be skipped)</summary>
              <ul className="mt-2 space-y-1">{preview.unmatched.slice(0, 100).map((x, i) => <li key={i}>Row {x.row}{x.class ? ` (${x.class})` : ''}: {x.name || 'no name'}. {x.reason}.</li>)}</ul>
            </details>
          ) : null}
          <div className="flex gap-2">
            <Button loading={applyM.isPending} onClick={() => {
              if (preview.students_removed + preview.teacher_links_ended > 0
                && !confirm(`${preview.students_removed} students and ${preview.teacher_links_ended} teachers will be taken off classes that are in this file. Continue?`)) return;
              applyM.mutate();
            }}>Apply changes</Button>
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
          </div>
        </Card>
      ) : null}

      {step === 3 && result ? (
        <Card className="p-8 text-center space-y-3">
          <CheckCircle2 className="size-10 text-ok mx-auto" />
          <h2 className="text-2xl font-bold">Class lists updated</h2>
          <p className="text-tx2">{result.classes_new} new classes, {result.classes_updated} updated · {result.students_added} students added, {result.students_removed} taken off · {result.teacher_links_added} teachers added.</p>
          <p className="text-sm text-tx2">New teacher accounts are named from their email; fix names under People &amp; roles. Teachers see their classes the next time they open the app.</p>
          <Button variant="secondary" onClick={reset}>Import another file</Button>
        </Card>
      ) : null}
    </>
  );
}
