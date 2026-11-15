'use client';
import { useQuery } from '@tanstack/react-query';
import { admin, type SurveyReport, type SurveyResponse } from '@zcs/core';
import { ClipboardList, Copy, Download, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Spinner } from '@/components/ui';
import { useConsole } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const SURVEY_URL = 'https://rakeshk99.github.io/ZCS-connect/survey/';
const TASKS: Record<string, string> = {
  signin: 'Signing in', notify: 'Getting notifications', read: 'Reading posts', confirm: 'Confirming a post', save: 'Saving a post',
  clear: 'Clearing read posts', message: 'Messaging a teacher', calendar: 'Checking the calendar', post: 'Sending a post',
  reach: 'Checking who saw a post', reply: 'Replying to families', classlist: 'Changing a class list', classevent: 'Adding a class event',
  website: 'Using the staff website',
};
const LABELS: Record<string, string> = {
  parent: 'Parent', staff: 'Staff', both: 'Both', once: 'Once', few_days: 'A few days', one_two_weeks: '1–2 weeks', longer: 'Longer',
  email: 'Email code', apple: 'Apple', google: 'Google', demo: 'Demo account', failed: 'Couldn’t sign in',
  too_many: 'Too many', right: 'About right', too_few: 'Too few', off: 'Turned off', none: 'Didn’t get any',
  minor: 'A little', annoying: 'Annoying', blocked: 'Stopped them',
  '1': 'Much worse', '2': 'Worse', '3': 'Same', '4': 'Better', '5': 'Much better',
};
const label = (k: string) => LABELS[k] ?? k;

// SUS benchmarks (Sauro & Lewis): 68 is the average product.
function susGrade(s: number | null) {
  if (s === null) return '';
  return s >= 80.3 ? 'Excellent' : s >= 68 ? 'Good (above average)' : s >= 51 ? 'OK (below average)' : 'Poor';
}

function csv(rows: SurveyResponse[]) {
  const taskKeys = Object.keys(TASKS);
  const head = ['submitted', 'role', 'usage', 'sign_in', ...taskKeys.flatMap((k) => [`${k}_ease`, `${k}_note`]),
    ...Array.from({ length: 10 }, (_, i) => `sus_${i + 1}`), 'sus_score', 'recommend', 'compared', 'notifications',
    'useful', 'frustrating', 'frustrating_impact', 'broken', 'wish', 'name', 'email', 'contact_ok'];
  const q = (v: unknown) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`);
  const body = rows.map((r) => [r.updated_at, r.role, r.usage, r.sign_in, ...taskKeys.flatMap((k) => [r.tasks[k]?.ease, r.tasks[k]?.note]),
    ...Array.from({ length: 10 }, (_, i) => r.sus?.[i]), r.sus_score, r.recommend, r.compared, r.notifications,
    r.useful, r.frustrating, r.frustrating_impact, r.broken, r.wish, r.name, r.email, r.contact_ok].map(q).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([head.join(',') + '\n' + body], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `zcs-tester-survey-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click(); URL.revokeObjectURL(url);
}

function Stat({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="text-sm text-tx2 font-semibold">{title}</div>
      <div className="text-3xl font-bold font-heading mt-1">{value}</div>
      {sub ? <div className="text-sm text-tx2 mt-1">{sub}</div> : null}
    </Card>
  );
}

function Counts({ title, data }: { title: string; data: Record<string, number> }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (!total) return null;
  return (
    <div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <ul className="space-y-1.5 text-sm">
        {Object.entries(data).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
          <li key={k} className="flex items-center gap-3">
            <span className="w-28 shrink-0">{label(k)}</span>
            <span className="flex-1 h-2 rounded bg-sf2 overflow-hidden"><span className="block h-full bg-navy" style={{ width: `${(n / total) * 100}%` }} /></span>
            <span className="w-8 text-right tabular-nums text-tx2">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Quotes({ title, rows, pick }: { title: string; rows: SurveyResponse[]; pick: (r: SurveyResponse) => string | null }) {
  const items = rows.filter((r) => pick(r));
  if (!items.length) return null;
  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3">{title} <span className="text-tx2 font-normal">({items.length})</span></h3>
      <ul className="space-y-3">
        {items.map((r) => (
          <li key={r.id} className="border-l-4 border-bd pl-3">
            <p className="whitespace-pre-wrap">{pick(r)}</p>
            <p className="text-xs text-tx2 mt-1">{label(r.role)}{r.name ? ` · ${r.name}` : ''}{r.contact_ok && r.email ? ` · ${r.email} (OK to follow up)` : ''}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Report({ r }: { r: SurveyReport }) {
  const fixFirst = r.rows.filter((x) => x.broken || (x.frustrating && x.frustrating_impact && x.frustrating_impact !== 'minor'))
    .sort((a, b) => Number(b.frustrating_impact === 'blocked') - Number(a.frustrating_impact === 'blocked'));
  const notes = r.rows.flatMap((x) => Object.entries(x.tasks).filter(([, t]) => t.note).map(([k, t]) => ({ id: `${x.id}-${k}`, k, t, who: x })));
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Responses" value={String(r.responses)} sub={Object.entries(r.by_role).map(([k, n]) => `${n} ${label(k).toLowerCase()}`).join(' · ')} />
        <Stat title="Ease of use (SUS, 0–100)" value={r.sus_avg === null ? '–' : String(r.sus_avg)} sub={r.sus_avg === null ? 'No complete answers yet' : `${susGrade(r.sus_avg)} · ${r.sus_n} answers · 68 is average`} />
        <Stat title="Would recommend (NPS)" value={r.nps === null ? '–' : `${r.nps > 0 ? '+' : ''}${r.nps}`} sub={r.recommend_avg === null ? undefined : `Average ${r.recommend_avg} / 10 · ${r.recommend_n} answers`} />
        <Stat title="vs. how they get news today" value={r.compared_avg === null ? '–' : `${r.compared_avg} / 5`} sub="3 = same, 5 = much better" />
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-1">How easy each part was</h3>
        <p className="text-sm text-tx2 mb-4">Hardest first. 1 = very hard, 5 = very easy. Anything under 3.5, or with several “hard” answers, is worth fixing.</p>
        <table className="w-full text-sm">
          <thead className="text-left text-tx2"><tr><th className="py-2">Task</th><th className="py-2 w-1/3">Average ease</th><th className="py-2 text-right">Tried</th><th className="py-2 text-right">Found it hard</th></tr></thead>
          <tbody>
            {r.tasks.map((t) => (
              <tr key={t.key} className="border-t border-bd">
                <td className="py-2.5 font-medium">{TASKS[t.key] ?? t.key}</td>
                <td className="py-2.5">
                  {t.avg_ease === null ? <span className="text-tx3">No one tried it</span> : (
                    <span className="flex items-center gap-2">
                      <span className="flex-1 h-2 rounded bg-sf2 overflow-hidden"><span className={`block h-full ${t.avg_ease < 3.5 ? 'bg-emergency' : 'bg-navy'}`} style={{ width: `${(t.avg_ease / 5) * 100}%` }} /></span>
                      <span className="tabular-nums w-9 text-right">{t.avg_ease}</span>
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-right tabular-nums">{t.tried} / {t.answered}</td>
                <td className="py-2.5 text-right tabular-nums">{t.hard ? <Badge tone="red">{t.hard}</Badge> : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-5 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Counts title="How they signed in" data={r.counts.sign_in} />
        <Counts title="Notifications were" data={r.counts.notifications} />
        <Counts title="How long they’ve used it" data={r.counts.usage} />
        <Counts title="Compared with today" data={r.counts.compared} />
        <Counts title="How much the problem got in the way" data={r.counts.frustrating_impact} />
      </Card>

      {fixFirst.length ? (
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Fix first <span className="text-tx2 font-normal">(things that broke, stopped or annoyed people)</span></h3>
          <ul className="space-y-3">
            {fixFirst.map((x) => (
              <li key={x.id} className="border-l-4 border-emergency pl-3">
                {x.frustrating ? <p className="whitespace-pre-wrap"><Badge tone={x.frustrating_impact === 'blocked' ? 'red' : 'maize'}>{label(x.frustrating_impact ?? '')}</Badge> {x.frustrating}</p> : null}
                {x.broken ? <p className="whitespace-pre-wrap mt-1"><Badge>Broke</Badge> {x.broken}</p> : null}
                <p className="text-xs text-tx2 mt-1">{label(x.role)}{x.name ? ` · ${x.name}` : ''}{x.contact_ok && x.email ? ` · ${x.email} (OK to follow up)` : ''}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {notes.length ? (
        <Card className="p-5">
          <h3 className="font-semibold mb-3">What got in the way, by task <span className="text-tx2 font-normal">({notes.length})</span></h3>
          <ul className="space-y-2">
            {notes.map((n) => <li key={n.id}><span className="font-medium">{TASKS[n.k] ?? n.k} ({n.t.ease}/5):</span> {n.t.note}</li>)}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Quotes title="Most useful" rows={r.rows} pick={(x) => x.useful} />
        <Quotes title="One thing to add or change" rows={r.rows} pick={(x) => x.wish} />
        <Quotes title="Confusing or frustrating" rows={r.rows} pick={(x) => x.frustrating} />
      </div>
    </div>
  );
}

export default function SurveyPage() {
  const { me } = useConsole();
  const office = !!me?.is_office;
  const [copied, setCopied] = useState('');
  const report = useQuery({ queryKey: ['survey'], queryFn: () => admin.surveyReport(supabase), enabled: office, refetchInterval: 60_000 });
  const copy = async (role: string) => {
    await navigator.clipboard.writeText(`${SURVEY_URL}?role=${role}`);
    setCopied(role); setTimeout(() => setCopied(''), 2000);
  };

  if (!office) return <Card><Empty icon={ShieldAlert} title="Office staff only" /></Card>;
  return (
    <>
      <PageHeader title="Tester survey" sub={<>A 5-minute web survey for testers, no sign-in needed. Send the parent or staff link; results update here every minute.</>}
        actions={<div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Copy} onClick={() => copy('parent')}>{copied === 'parent' ? 'Copied' : 'Copy parent link'}</Button>
          <Button variant="secondary" icon={Copy} onClick={() => copy('staff')}>{copied === 'staff' ? 'Copied' : 'Copy staff link'}</Button>
          <Button icon={Download} disabled={!report.data?.rows.length} onClick={() => report.data && csv(report.data.rows)}>Export CSV</Button>
        </div>} />
      <ErrorNote error={report.error} />
      {report.isLoading ? <Spinner /> : null}
      {report.data && report.data.responses === 0 ? (
        <Card><Empty icon={ClipboardList} title="No answers yet" body={`Send testers ${SURVEY_URL}?role=parent (or ?role=staff). Answers show up here within a minute.`} /></Card>
      ) : null}
      {report.data && report.data.responses > 0 ? <Report r={report.data} /> : null}
    </>
  );
}
