'use client';
// Students & guardians: the office looks up a student and manages each family
// contact's custody flags (decision: office-only, always audited). Changes made
// here are locked so a later roster import doesn't undo them.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { admin, type GuardianLink } from '@zcs/core';
import { Contact, Lock, Search, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, Empty, ErrorNote, Input, PageHeader, Spinner, cx } from '@/components/ui';
import { useStaff } from '@/lib/session';
import { supabase } from '@/lib/supabase';

function Flag({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cx('flex items-start gap-2 text-sm cursor-pointer', disabled && 'opacity-50 cursor-not-allowed')}>
      <input type="checkbox" className="size-4 mt-0.5" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span><b className="font-semibold">{label}</b><span className="block text-tx2">{hint}</span></span>
    </label>
  );
}

function GuardianRow({ g, onSaved }: { g: GuardianLink; onSaved: () => void }) {
  const flags = useMutation({
    mutationFn: (f: { noContact: boolean; hideContact: boolean; canSign: boolean }) => admin.setGuardianFlags(supabase, g.id, f),
    onSuccess: onSaved,
  });
  const active = useMutation({ mutationFn: (v: boolean) => admin.setGuardianActive(supabase, g.id, v), onSuccess: onSaved });
  const cur = { noContact: g.no_contact, hideContact: g.hide_contact, canSign: g.can_sign_forms };
  return (
    <div className={cx('rounded-xl border p-4 space-y-3', g.no_contact ? 'border-emergency' : 'border-bd', !g.is_active && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-48">
          <div className="font-semibold">{g.name || g.email} <span className="text-tx2 font-normal">· {g.relationship}</span></div>
          <div className="text-sm text-tx2">{g.email} · {g.signed_in ? 'has signed in' : 'not signed in yet'}</div>
        </div>
        {g.no_contact ? <Badge tone="red"><ShieldAlert className="size-3" />No contact</Badge> : null}
        {!g.is_active ? <Badge>Removed</Badge> : null}
        {g.locked_by_office ? <Badge><Lock className="size-3" />Set by office</Badge> : null}
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <Flag label="No contact" hint="Receives nothing and can't message staff about this student." checked={g.no_contact}
          disabled={!g.is_active || flags.isPending} onChange={(v) => {
            if (v && !confirm(`Stop all communication with ${g.name || g.email} about this student? They lose access to existing conversations too.`)) return;
            flags.mutate({ ...cur, noContact: v });
          }} />
        <Flag label="Hide contact details" hint="Staff see the name but not the email or phone." checked={g.hide_contact}
          disabled={!g.is_active || flags.isPending} onChange={(v) => flags.mutate({ ...cur, hideContact: v })} />
        <Flag label="Can sign forms" hint="Allowed to acknowledge on behalf of the family." checked={g.can_sign_forms}
          disabled={!g.is_active || flags.isPending} onChange={(v) => flags.mutate({ ...cur, canSign: v })} />
      </div>
      <div className="flex gap-2">
        {g.is_active
          ? <Button variant="secondary" loading={active.isPending} onClick={() => { if (confirm(`Remove ${g.name || g.email} as a contact for this student?`)) active.mutate(false); }}>Remove contact</Button>
          : <Button variant="secondary" loading={active.isPending} onClick={() => active.mutate(true)}>Restore contact</Button>}
      </div>
      <ErrorNote error={flags.error ?? active.error} />
    </div>
  );
}

export default function Students() {
  const qc = useQueryClient();
  const { isOffice } = useStaff();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const list = useQuery({ queryKey: ['student-guardians', search], queryFn: () => admin.studentGuardians(supabase, search), enabled: isOffice && search.length >= 2 });
  const refresh = () => qc.invalidateQueries({ queryKey: ['student-guardians'] });

  if (!isOffice) return <Card><Empty icon={ShieldAlert} title="Office only" /></Card>;
  return (
    <>
      <PageHeader title="Students & guardians" sub="Look up a student to manage who can be contacted. Every change is recorded in the audit log and kept when the roster is re-imported." />
      <form className="flex gap-2 mb-5" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}>
        <div className="relative w-96"><Search className="size-4 absolute left-3 top-3 text-tx3" />
          <Input className="pl-9" placeholder="Student name" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Button variant="secondary" type="submit">Search</Button>
      </form>
      <ErrorNote error={list.error} />
      {list.isFetching && !list.data ? <Spinner /> : null}
      {search.length < 2 ? <Card><Empty icon={Contact} title="Search for a student" body="Type at least two letters of a first or last name." /></Card> : null}
      {list.data?.length === 0 ? <Card><Empty icon={Contact} title="No students match" /></Card> : null}
      <div className="space-y-4">
        {list.data?.map((s) => (
          <Card key={s.id} className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold flex-1">{s.name}</h2>
              <span className="text-tx2">{s.grade ?? 'No grade'}</span>
              {!s.is_active ? <Badge>Not enrolled</Badge> : null}
            </div>
            {s.guardians.length === 0 ? <p className="text-sm text-tx2">No family contacts on file.</p> : null}
            {s.guardians.map((g) => <GuardianRow key={g.id} g={g} onSaved={refresh} />)}
          </Card>
        ))}
      </div>
    </>
  );
}
