'use client';
// Roster import wizard, designed for the office manager rather than IT:
// 1 Upload → 2 Check columns → 3 Preview changes → 4 Done (reversible).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  admin, gradeFromSheetName, guessField, hasHeaderRow, parseMappedRows, parseSmartRow, ROSTER_FIELDS,
  type RosterField, type RosterPreview, type RosterRow,
} from '@zcs/core';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { useState } from 'react';
import readXlsxFile, { readSheetNames } from 'read-excel-file';
import { Badge, Button, Card, ErrorNote, PageHeader, SectionTitle, Select, cx } from '@/components/ui';
import { supabase } from '@/lib/supabase';

type Sheet = { name: string; rows: string[][] };
const STEPS = ['Upload', 'Check columns', 'Preview changes', 'Done'];

async function readFile(file: File): Promise<Sheet[]> {
  if (/\.(xlsx|xlsm)$/i.test(file.name)) {
    const names = await readSheetNames(file);
    return Promise.all(names.map(async (name) => ({ name, rows: (await readXlsxFile(file, { sheet: name })).map((r) => r.map((c) => (c == null ? '' : String(c)))) })));
  }
  const text = await file.text();
  // Google Sheets "Download as CSV" and the ZCS export sometimes arrive as one column wrapped in ``` fences.
  const cleaned = text.replace(/^```.*$/gm, '').trim();
  const parsed = Papa.parse<string[]>(cleaned, { skipEmptyLines: true });
  return [{ name: file.name.replace(/\.\w+$/, ''), rows: parsed.data }];
}

export default function RosterImport() {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [header, setHeader] = useState(false);
  const [mapping, setMapping] = useState<RosterField[]>([]);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [deactivate, setDeactivate] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const history = useQuery({ queryKey: ['roster-imports'], queryFn: () => admin.rosterImports(supabase) });

  const buildRows = (s: Sheet[], hdr: boolean, map: RosterField[]) =>
    s.flatMap((sh) => {
      const grade = gradeFromSheetName(sh.name);
      if (hdr) return parseMappedRows(sh.rows.slice(1), map, grade);
      return sh.rows.map((r) => parseSmartRow(r, grade)).filter((r): r is RosterRow => !!r);
    });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const s = (await readFile(file)).filter((x) => x.rows.length);
      if (!s.length) throw new Error('That file looks empty.');
      const hdr = hasHeaderRow(s[0]!.rows);
      const map = hdr ? s[0]!.rows[0]!.map((h) => guessField(String(h))) : [];
      setFileName(file.name); setSheets(s); setHeader(hdr); setMapping(map); setRows(buildRows(s, hdr, map)); setStep(1);
    } catch (e) { setError(e); }
  };

  const previewM = useMutation({
    mutationFn: () => admin.previewRoster(supabase, fileName, rows),
    onSuccess: (p) => { setPreview(p); setStep(2); },
    onError: setError,
  });
  const applyM = useMutation({
    mutationFn: () => admin.applyRoster(supabase, preview!.import_id, deactivate),
    onSuccess: (r) => { setResult(r); setStep(3); qc.invalidateQueries({ queryKey: ['roster-imports'] }); qc.invalidateQueries({ queryKey: ['stats'] }); },
    onError: setError,
  });
  const revertM = useMutation({
    mutationFn: (id: string) => admin.revertRoster(supabase, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roster-imports'] }),
    onError: setError,
  });

  const reset = () => { setStep(0); setSheets([]); setRows([]); setPreview(null); setResult(null); setError(null); };
  const totalRows = sheets.reduce((n, s) => n + s.rows.length - (header ? 1 : 0), 0);

  return (
    <>
      <PageHeader title="Roster import" sub="Upload the family list from the office. You'll see every change before anything is saved, and you can undo an import." />
      <ol className="flex gap-2 mb-6" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined}
            className={cx('flex items-center gap-2 rounded-full px-3 h-8 text-sm font-semibold', i === step ? 'bg-navy text-white' : i < step ? 'bg-okbg text-ok' : 'bg-sf2 text-tx2')}>
            <span>{i + 1}</span>{s}
          </li>
        ))}
      </ol>
      <ErrorNote error={error} />

      {step === 0 ? (
        <Card className="p-10">
          <label className="flex flex-col items-center gap-3 border-2 border-dashed border-bds rounded-2xl py-14 cursor-pointer hover:bg-bg">
            <Upload className="size-8 text-navy" />
            <span className="font-heading font-bold text-lg">Choose a spreadsheet</span>
            <span className="text-sm text-tx2 text-center max-w-md">Excel (.xlsx) with one tab per grade, or a CSV downloaded from Google Sheets. Columns can be in any order.</span>
            <input type="file" accept=".csv,.xlsx,.xlsm,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <FileSpreadsheet className="size-5 text-navy" /><span className="font-semibold">{fileName}</span>
            <Badge>{sheets.length} tab{sheets.length === 1 ? '' : 's'}</Badge><Badge>{totalRows} rows</Badge>
            <label className="ml-auto flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={header} onChange={(e) => {
                const hdr = e.target.checked;
                const map = hdr ? sheets[0]!.rows[0]!.map((h) => guessField(String(h))) : [];
                setHeader(hdr); setMapping(map); setRows(buildRows(sheets, hdr, map));
              }} /> First row has column names
            </label>
          </div>
          {header ? (
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead><tr>{sheets[0]!.rows[0]!.map((h, i) => (
                  <th key={i} className="p-1.5 text-left align-bottom">
                    <div className="text-xs text-tx2 mb-1 font-normal">{h}</div>
                    <Select value={mapping[i] ?? 'ignore'} onChange={(e) => {
                      const m = [...mapping]; m[i] = e.target.value as RosterField; setMapping(m); setRows(buildRows(sheets, true, m));
                    }} className="h-9 text-sm">{ROSTER_FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                  </th>))}</tr></thead>
                <tbody>{sheets[0]!.rows.slice(1, 4).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="p-1.5 text-tx2 whitespace-nowrap">{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-tx2">No column names found, so columns were read automatically: student name, grade, then each guardian&apos;s email and name. Check the sample below.</p>
          )}
          <SectionTitle>How the first rows were read</SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-bd">
            <table className="w-full text-sm">
              <thead className="bg-sf2 text-left text-tx2"><tr><th className="p-2">Student</th><th className="p-2">Preferred</th><th className="p-2">Grade</th><th className="p-2">Guardians</th></tr></thead>
              <tbody>
                {rows.slice(0, 8).map((r, i) => (
                  <tr key={i} className="border-t border-bd">
                    <td className="p-2">{[r.first, r.middle, r.last].filter(Boolean).join(' ')}</td>
                    <td className="p-2">{r.preferred ?? ''}</td>
                    <td className="p-2">{r.grade || <span className="text-emergency">missing</span>}</td>
                    <td className="p-2">{r.guardians.map((g) => `${g.first ?? ''} ${g.last ?? ''} <${g.email}>`).join(' · ') || <span className="text-emergency">none</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button loading={previewM.isPending} disabled={!rows.length} onClick={() => previewM.mutate()}>Preview changes for {rows.length} students</Button>
            <Button variant="secondary" onClick={reset}>Choose a different file</Button>
          </div>
        </Card>
      ) : null}

      {step === 2 && preview ? (
        <Card className="p-6 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[['New students', preview.new_students], ['Updated students', preview.updated_students], ['New family contacts', preview.new_guardians], ['Unchanged', preview.unchanged_students]].map(([l, n]) => (
              <div key={l as string} className="rounded-xl bg-bg p-4"><div className="text-sm text-tx2">{l}</div><div className="font-heading font-bold text-2xl">{n}</div></div>
            ))}
          </div>
          <p className="text-[15px]">
            {preview.shared_guardians > 0 ? <>{preview.shared_guardians} parent email{preview.shared_guardians === 1 ? ' is' : 's are'} shared across siblings and will be one account each. </> : null}
            {preview.guardian_links} guardian links in total.
          </p>
          {preview.unmatched_grades.length ? (
            <div className="flex gap-2 rounded-xl bg-maize/25 p-4 text-sm"><AlertTriangle className="size-5 shrink-0" />
              <div>These grade labels didn&apos;t match a ZCS grade, so those students will have no grade: <b>{preview.unmatched_grades.join(', ')}</b>. Ask an admin to add the spelling as a grade alias, or fix the file.</div></div>
          ) : null}
          {preview.issues.length ? (
            <details className="rounded-xl bg-sf2 p-4 text-sm"><summary className="cursor-pointer font-semibold">{preview.issues.length} rows need attention (they&apos;ll be skipped)</summary>
              <ul className="mt-2 space-y-1">{preview.issues.slice(0, 50).map((x, i) => <li key={i}>Row {x.row}: {x.problem}</li>)}</ul></details>
          ) : null}
          {preview.removed_guardian_links ? (
            <div className="flex gap-2 rounded-xl bg-sf2 p-4 text-sm"><AlertTriangle className="size-5 shrink-0" />
              <div><b>{preview.removed_guardian_links}</b> family contact{preview.removed_guardian_links === 1 ? ' is' : 's are'} no longer listed for their student and will stop receiving posts and messages. Contacts the office set up by hand aren&apos;t changed.</div></div>
          ) : null}
          <label className="flex items-start gap-3 text-[15px] cursor-pointer">
            <input type="checkbox" className="size-5 mt-0.5" checked={deactivate} onChange={(e) => setDeactivate(e.target.checked)} />
            <span>Mark the <b>{preview.deactivated_students}</b> students who aren&apos;t in this file as no longer enrolled. Their families stop receiving class posts. Nothing is deleted.</span>
          </label>
          <div className="flex gap-2">
            <Button loading={applyM.isPending} onClick={() => {
              if (deactivate && !confirm(`Mark ${preview.deactivated_students} students who aren't in this file as no longer enrolled? Their families will stop receiving posts. You can undo this import afterwards.`)) return;
              applyM.mutate();
            }}>Apply changes</Button>
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
          </div>
        </Card>
      ) : null}

      {step === 3 && result ? (
        <Card className="p-8 text-center space-y-3">
          <CheckCircle2 className="size-10 text-ok mx-auto" />
          <h2 className="text-2xl font-bold">Roster updated</h2>
          <p className="text-tx2">{result.new_students} new students, {result.updated_students} updated, {result.new_guardians} new family contacts, {result.removed_guardian_links ?? 0} contacts removed, {result.deactivated_students} marked not enrolled.</p>
          <p className="text-sm text-tx2">Families can sign in with the email on file right away. You can undo this import below.</p>
          <Button variant="secondary" onClick={reset}>Import another file</Button>
        </Card>
      ) : null}

      <SectionTitle>Recent imports</SectionTitle>
      <Card>
        {(history.data ?? []).length === 0 ? <div className="p-4 text-sm text-tx2">No imports yet.</div> : null}
        {(history.data ?? []).map((h, i) => (
          <div key={h.id} className="flex items-center gap-3 px-4 py-3 border-t first:border-t-0 border-bd">
            <FileSpreadsheet className="size-4 text-navy" />
            <div className="flex-1"><div className="font-semibold">{h.file_name}</div>
              <div className="text-sm text-tx2">{new Date(h.created_at).toLocaleString()} · {h.summary?.rows ?? 0} rows</div></div>
            <Badge tone={h.status === 'applied' ? 'ok' : 'neutral'}>{h.status}</Badge>
            {h.status === 'applied' && i === (history.data ?? []).findIndex((x) => x.status === 'applied') ? (
              <Button variant="ghost" icon={RotateCcw} loading={revertM.isPending} onClick={() => { if (confirm('Undo this import? Students and contacts it added are removed, and anyone it marked not enrolled or removed is restored.')) revertM.mutate(h.id); }}>Undo</Button>
            ) : null}
          </div>
        ))}
      </Card>
    </>
  );
}
