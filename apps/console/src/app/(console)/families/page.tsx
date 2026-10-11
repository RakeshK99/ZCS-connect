'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { admin, relativeTime } from '@zcs/core';
import { Check, Search, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, Empty, ErrorNote, Input, Label, PageHeader, Select, Spinner } from '@/components/ui';
import { supabase } from '@/lib/supabase';

function Approve({ id, email, onDone }: { id: string; email: string; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<{ id: string; label: string }[]>([]);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [rel, setRel] = useState('guardian');
  const results = useQuery({ queryKey: ['student-search', q], queryFn: () => admin.searchStudents(supabase, q), enabled: q.trim().length >= 2 });
  const approve = useMutation({ mutationFn: () => admin.resolveFamilyRequest(supabase, id, true, picked.map((p) => p.id), first, last, rel), onSuccess: onDone });

  return (
    <div className="mt-4 rounded-xl bg-bg p-4 space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <div><Label>Guardian first name</Label><Input value={first} onChange={(e) => setFirst(e.target.value)} /></div>
        <div><Label>Last name</Label><Input value={last} onChange={(e) => setLast(e.target.value)} /></div>
        <div><Label>Relationship</Label><Select value={rel} onChange={(e) => setRel(e.target.value)} className="w-full">
          <option value="guardian">Guardian</option><option value="mother">Mother</option><option value="father">Father</option><option value="grandparent">Grandparent</option></Select></div>
      </div>
      <div>
        <Label>Link {email} to these students</Label>
        <div className="relative"><Search className="size-4 absolute left-3 top-3 text-tx3" /><Input className="pl-9" placeholder="Search students by name" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {results.data?.length ? (
          <ul className="mt-2 max-h-48 overflow-auto rounded-xl border border-bd bg-sf">
            {results.data.map((s) => {
              const label = `${s.preferred_name || s.first_name} ${s.last_name}${s.grades ? ` · ${s.grades.label}` : ''}`;
              const on = picked.some((p) => p.id === s.id);
              return (
                <li key={s.id}><button className="w-full text-left px-3 py-2 hover:bg-sf2 flex items-center gap-2 cursor-pointer"
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x.id !== s.id) : [...p, { id: s.id, label }]))}>
                  <input type="checkbox" readOnly checked={on} /> {label}</button></li>
              );
            })}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2 mt-2">{picked.map((p) => <Badge key={p.id} tone="navy">{p.label}</Badge>)}</div>
      </div>
      <ErrorNote error={approve.error} />
      <Button icon={Check} disabled={!picked.length} loading={approve.isPending} onClick={() => approve.mutate()}>Connect family</Button>
    </div>
  );
}

export default function Families() {
  const qc = useQueryClient();
  const reqs = useQuery({ queryKey: ['family-requests'], queryFn: () => admin.familyRequests(supabase), refetchInterval: 30_000 });
  const [open, setOpen] = useState<string | null>(null);
  const dismiss = useMutation({ mutationFn: (id: string) => admin.resolveFamilyRequest(supabase, id, false), onSuccess: () => qc.invalidateQueries({ queryKey: ['family-requests'] }) });
  const done = () => { setOpen(null); qc.invalidateQueries({ queryKey: ['family-requests'] }); qc.invalidateQueries({ queryKey: ['stats'] }); };

  return (
    <>
      <PageHeader title="Family requests" sub="Parents who signed in with an email that isn't on the roster yet. Connect them to their children, or dismiss the request." />
      {reqs.isLoading ? <Spinner /> : null}
      <ErrorNote error={reqs.error ?? dismiss.error} />
      {reqs.data?.length === 0 ? <Card><Empty icon={UserPlus} title="All caught up" body="New requests from the app will appear here." /></Card> : null}
      <div className="space-y-3">
        {reqs.data?.map((r) => (
          <Card key={r.id} className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1"><div className="font-semibold">{r.email}</div>
                <div className="text-sm text-tx2">Requested {relativeTime(r.created_at)}{r.note ? ` · ${r.note}` : ''}</div></div>
              <Button variant={open === r.id ? 'secondary' : 'primary'} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Cancel' : 'Connect to students'}</Button>
              <Button variant="ghost" icon={X} onClick={() => dismiss.mutate(r.id)}>Dismiss</Button>
            </div>
            {open === r.id ? <Approve id={r.id} email={r.email} onDone={done} /> : null}
          </Card>
        ))}
      </div>
    </>
  );
}
