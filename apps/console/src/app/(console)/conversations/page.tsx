'use client';
// Admin conversation review (decision H3). Opening a thread requires a reason,
// and both the list and every opened thread are written to the audit log.
import { useMutation, useQuery } from '@tanstack/react-query';
import { admin, relativeTime, type OversightMessage, type OversightThread } from '@zcs/core';
import { Eye, MessagesSquare, Search, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Empty, ErrorNote, Input, Label, PageHeader, Spinner, cx } from '@/components/ui';
import { useStaff } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function Conversations() {
  const { isAdmin } = useStaff();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const threads = useQuery({ queryKey: ['oversight', search], queryFn: () => admin.oversightThreads(supabase, search), enabled: isAdmin });
  const [selected, setSelected] = useState<OversightThread | null>(null);
  const [reason, setReason] = useState('');
  const [messages, setMessages] = useState<OversightMessage[] | null>(null);
  const open = useMutation({ mutationFn: () => admin.oversightOpen(supabase, selected!.id, reason), onSuccess: setMessages });

  if (!isAdmin) return <Card><Empty icon={ShieldAlert} title="Admins only" body="Conversation review is limited to district admins." /></Card>;

  return (
    <>
      <PageHeader title="Conversation review" sub="Read parent–teacher conversations when there's a safeguarding reason. Every view is recorded with your name and reason." />
      <div className="flex gap-2 mb-4">
        <div className="relative w-96"><Search className="size-4 absolute left-3 top-3 text-tx3" />
          <Input className="pl-9" placeholder="Search by student, parent or teacher" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setSearch(q)} /></div>
        <Button variant="secondary" onClick={() => setSearch(q)}>Search</Button>
      </div>
      <div className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">
        <Card className="overflow-hidden">
          {threads.isLoading ? <Spinner /> : null}
          <ErrorNote error={threads.error} />
          {threads.data?.length === 0 ? <Empty icon={MessagesSquare} title="No conversations" /> : null}
          {threads.data?.map((t) => (
            <button key={t.id} onClick={() => { setSelected(t); setMessages(null); setReason(''); }}
              className={cx('w-full text-left px-4 py-3 border-t first:border-t-0 border-bd hover:bg-bg cursor-pointer', selected?.id === t.id && 'bg-tint')}>
              <div className="flex justify-between gap-2"><span className="font-semibold">{t.student}</span><span className="text-xs text-tx2">{relativeTime(t.last_message_at)}</span></div>
              <div className="text-sm text-tx2">{t.participants.join(' · ')}</div>
              <div className="text-xs text-tx3">{t.grade ?? ''} · {t.messages} messages</div>
            </button>
          ))}
        </Card>
        <div>
          {!selected ? <Card><Empty icon={Eye} title="Choose a conversation" body="Select a conversation on the left. You'll be asked for a reason before it opens." /></Card> : null}
          {selected && !messages ? (
            <Card className="p-5 space-y-3">
              <div className="flex gap-2 rounded-xl bg-maize/25 p-3 text-sm"><ShieldAlert className="size-5 shrink-0" />This view will be logged with your name, the time and the reason below.</div>
              <div><Label htmlFor="reason">Reason for review</Label><Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Parent asked the office to review a concern" /></div>
              <ErrorNote error={open.error} />
              <Button icon={Eye} disabled={reason.trim().length < 5} loading={open.isPending} onClick={() => open.mutate()}>Open conversation</Button>
            </Card>
          ) : null}
          {selected && messages ? (
            <Card className="p-5">
              <div className="flex items-center gap-2 text-sm rounded-xl bg-sf2 px-3 py-2 mb-4"><ShieldAlert className="size-4" />Logged review · {selected.student} · {selected.participants.join(', ')}</div>
              <div className="space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className={cx('max-w-[80%] rounded-2xl px-4 py-2.5', m.sender_context === 'staff' ? 'bg-navy text-white ml-auto' : 'bg-sf2')}>
                    <div className={cx('text-xs font-semibold mb-0.5', m.sender_context === 'staff' ? 'text-white/70' : 'text-tx2')}>{m.sender} · {new Date(m.created_at).toLocaleString()}</div>
                    <div className="whitespace-pre-wrap">{m.body}</div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
