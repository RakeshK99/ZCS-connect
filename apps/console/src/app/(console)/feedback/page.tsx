'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { admin, type FeedbackNote } from '@zcs/core';
import { Check, MessageSquareHeart, RotateCcw, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Select, Spinner } from '@/components/ui';
import { useConsole } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const FILTERS = [{ id: 'new', label: 'To review' }, { id: 'done', label: 'Handled' }, { id: '', label: 'Everything' }] as const;

function details(n: FeedbackNote) {
  const m = n.meta ?? {};
  return [m.version && `v${m.version}${m.build ? ` (${m.build})` : ''}`, m.platform && `${m.platform === 'ios' ? 'iPhone' : m.platform}${m.os ? ` ${m.os}` : ''}`,
    m.context && (m.context === 'staff' ? 'as staff' : 'as parent')].filter(Boolean).join(' · ');
}

export default function FeedbackPage() {
  const { me } = useConsole();
  const office = !!me?.is_office;
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'new' | 'done' | ''>('new');
  const notes = useQuery({ queryKey: ['feedback', filter], queryFn: () => admin.feedback(supabase, filter || null), enabled: office });
  const mark = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'new' | 'done' }) => admin.setFeedbackStatus(supabase, id, status),
    onSettled: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
  });

  if (!office) return <Card><Empty icon={ShieldAlert} title="Office staff only" /></Card>;
  return (
    <>
      <PageHeader title="App feedback" sub="Notes families and staff send from Profile → Send feedback in the app."
        actions={<Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>{FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>} />
      <ErrorNote error={notes.error ?? mark.error} />
      {notes.isLoading ? <Spinner /> : null}
      {notes.data?.length === 0 ? <Card><Empty icon={MessageSquareHeart} title={filter === 'new' ? 'Nothing new to review' : 'No feedback yet'} body="New notes show up here as soon as someone sends one." /></Card> : null}
      <div className="space-y-3">
        {notes.data?.map((n) => (
          <Card key={n.id} className="p-5">
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{n.name ?? n.email ?? 'Deleted account'}</span>
                  {n.who ? <Badge tone={n.who === 'Staff' ? 'navy' : 'neutral'}>{n.who}</Badge> : null}
                  {n.status === 'done' ? <Badge tone="ok">Handled</Badge> : null}
                  <span className="text-tx2">{new Date(n.created_at).toLocaleString()}</span>
                </div>
                {n.name && n.email ? <div className="text-sm text-tx2 mt-0.5">{n.email}</div> : null}
                <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{n.body}</p>
                {details(n) ? <p className="mt-2 text-xs text-tx2">{details(n)}</p> : null}
              </div>
              {n.status === 'new' ? (
                <Button variant="secondary" icon={Check} loading={mark.isPending && mark.variables?.id === n.id} onClick={() => mark.mutate({ id: n.id, status: 'done' })}>Mark handled</Button>
              ) : (
                <Button variant="ghost" icon={RotateCcw} onClick={() => mark.mutate({ id: n.id, status: 'new' })}>Reopen</Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
