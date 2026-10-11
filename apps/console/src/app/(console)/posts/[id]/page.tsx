'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, type FamilyStatus } from '@zcs/core';
import { ArrowLeft, Download, Mail } from 'lucide-react';
import Link from 'next/link';
import { use, useState } from 'react';
import { Badge, Button, Card, ErrorNote, PageHeader, ReachBar, SectionTitle, Spinner } from '@/components/ui';
import { supabase } from '@/lib/supabase';

function csv(rows: FamilyStatus[]) {
  const head = 'Family,Student,Reached,Read,Confirmed,Channel\n';
  const body = rows.map((r) => [r.family, r.child, r.reached ? 'yes' : 'no', r.read ? 'yes' : 'no', r.acked ? 'yes' : 'no', r.via ?? '']
    .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([head + body], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'reach.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

export default function PostReach({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const reach = useQuery({ queryKey: ['reach', id], queryFn: () => api.postReach(supabase, id), refetchInterval: 5000 });
  const [reminded, setReminded] = useState<string | null>(null);
  const remind = useMutation({
    mutationFn: (ids: string[]) => api.remindFamilies(supabase, id, ids),
    onSuccess: (n) => setReminded(`Reminder emailed to ${n} guardian${n === 1 ? '' : 's'}.`),
  });

  const d = reach.data;
  return (
    <>
      <Link href="/" className="inline-flex items-center gap-1 text-navy font-semibold text-sm mb-4"><ArrowLeft className="size-4" />Dashboard</Link>
      {reach.isLoading ? <Spinner /> : null}
      <ErrorNote error={reach.error} />
      {d ? (
        <>
          <PageHeader title={d.post.title}
            sub={<>{d.post.audience_label} · {d.post.sent_at ? new Date(d.post.sent_at).toLocaleString() : `Status: ${d.post.status}`} {d.post.priority !== 'normal' ? <Badge tone={d.post.priority === 'emergency' ? 'red' : 'maize'}>{d.post.priority}</Badge> : null}</>}
            actions={<Button variant="secondary" icon={Download} onClick={() => csv(d.families)}>Export CSV</Button>} />
          <Card className="p-6 space-y-4">
            <div className="font-heading font-bold text-2xl">{d.summary.reached} of {d.summary.families} families reached <span className="text-tx2">· {d.summary.read} read</span></div>
            <ReachBar {...d.summary} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><div className="text-tx2">Read</div><div className="font-heading font-bold text-xl">{d.summary.read}</div></div>
              <div><div className="text-tx2">Delivered, not read</div><div className="font-heading font-bold text-xl">{d.summary.reached - d.summary.read}</div></div>
              <div><div className="text-tx2">Not reached</div><div className="font-heading font-bold text-xl">{d.summary.families - d.summary.reached}</div></div>
              {d.post.require_ack ? <div><div className="text-tx2">Confirmed</div><div className="font-heading font-bold text-xl">{d.summary.acked}</div></div> : null}
            </div>
            <div className="text-sm text-tx2">{d.by_channel.push} by push notification · {d.by_channel.email} by email</div>
          </Card>
          {reminded ? <div className="mt-4 rounded-xl bg-okbg text-ok px-4 py-3 text-sm font-semibold">{reminded}</div> : null}
          <ErrorNote error={remind.error} />

          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <SectionTitle>Not reached yet ({d.not_reached.length})</SectionTitle>
              <Card>
                {d.not_reached.length === 0 ? <div className="p-4 text-sm text-tx2">Every family has been reached.</div> : null}
                {d.not_reached.map((f) => (
                  <div key={f.student_id} className="flex items-center gap-3 px-4 py-3 border-t first:border-t-0 border-bd">
                    <div className="flex-1"><div className="font-semibold">{f.family}</div><div className="text-sm text-tx2">{f.child} · {f.reason}</div></div>
                    <Button variant="secondary" icon={Mail} onClick={() => remind.mutate([f.student_id])}>Remind</Button>
                  </div>
                ))}
                {d.not_reached.length > 1 ? (
                  <div className="px-4 py-3 border-t border-bd"><Button variant="ghost" onClick={() => remind.mutate(d.not_reached.map((f) => f.student_id))}>Remind all {d.not_reached.length}</Button></div>
                ) : null}
              </Card>
            </div>
            <div>
              <SectionTitle>Delivered, not read yet ({d.unread.length})</SectionTitle>
              <Card>
                {d.unread.map((f) => (
                  <div key={f.student_id} className="flex items-center gap-3 px-4 py-2.5 border-t first:border-t-0 border-bd">
                    <div className="flex-1"><div className="font-semibold">{f.family}</div><div className="text-sm text-tx2">{f.child}</div></div>
                    <span className="text-xs text-tx3">{f.via}</span>
                  </div>
                ))}
                {d.unread.length === 0 ? <div className="p-4 text-sm text-tx2">No one is waiting.</div> : null}
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
