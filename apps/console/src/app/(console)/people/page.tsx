'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { admin, ROLE_LABELS, ROLE_SCOPE, type PersonRow, type RoleKind } from '@zcs/core';
import { Plus, Search, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, Empty, ErrorNote, Input, Label, PageHeader, Select, Spinner } from '@/components/ui';
import { useStaff } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const ROLES = Object.keys(ROLE_LABELS) as RoleKind[];

function GrantForm({ person, onDone }: { person: PersonRow; onDone: () => void }) {
  const scopes = useQuery({ queryKey: ['scopes'], queryFn: () => admin.scopes(supabase) });
  const [role, setRole] = useState<RoleKind>('teacher');
  const [scopeId, setScopeId] = useState('');
  const [ends, setEnds] = useState('');
  const scopeType = ROLE_SCOPE[role];
  const opts = scopeType === 'school' ? [] : scopes.data?.[scopeType] ?? [];
  const grant = useMutation({
    mutationFn: () => admin.grant(supabase, person.id, role, scopeType, scopeType === 'school' ? null : scopeId, ends ? new Date(ends).toISOString() : null),
    onSuccess: onDone,
  });
  return (
    <div className="mt-3 rounded-xl bg-bg p-4 grid md:grid-cols-[1fr_1.4fr_auto_auto] gap-3 items-end">
      <div><Label>Role</Label><Select className="w-full" value={role} onChange={(e) => { setRole(e.target.value as RoleKind); setScopeId(''); }}>
        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></div>
      <div><Label>{scopeType === 'school' ? 'Scope' : scopeType === 'class' ? 'Class or group' : 'Division'}</Label>
        {scopeType === 'school' ? <div className="h-10 flex items-center text-tx2">Whole school</div> : (
          <Select className="w-full" value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
            <option value="">Choose…</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>
        )}</div>
      <div><Label>Ends (optional)</Label><Input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} /></div>
      <Button icon={Plus} loading={grant.isPending} disabled={scopeType !== 'school' && !scopeId} onClick={() => grant.mutate()}>Grant</Button>
      <div className="md:col-span-4"><ErrorNote error={grant.error} /></div>
    </div>
  );
}

function AddStaff({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ email: '', first: '', last: '', honorific: 'Mrs.', title: '', officeHours: '' });
  const save = useMutation({ mutationFn: () => admin.upsertStaff(supabase, f), onSuccess: onDone });
  return (
    <Card className="p-5 mb-6 space-y-3">
      <div className="font-heading font-bold text-lg">Add a staff member</div>
      <div className="grid md:grid-cols-3 gap-3">
        <div><Label>Email (@zcs.org)</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><Label>First name</Label><Input value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} /></div>
        <div><Label>Last name</Label><Input value={f.last} onChange={(e) => setF({ ...f, last: e.target.value })} /></div>
        <div><Label>Shown to families as</Label><Select className="w-full" value={f.honorific} onChange={(e) => setF({ ...f, honorific: e.target.value })}>
          {['Mrs.', 'Mr.', 'Ms.', 'Miss', 'Dr.', ''].map((h) => <option key={h} value={h}>{h ? `${h} ${f.last || 'Last name'}` : `${f.first || 'First'} ${f.last || 'Last'}`}</option>)}</Select></div>
        <div><Label>Title</Label><Input placeholder="3rd grade teacher" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><Label>Office hours note</Label><Input placeholder="Usually replies 7:30 AM – 4:00 PM" value={f.officeHours} onChange={(e) => setF({ ...f, officeHours: e.target.value })} /></div>
      </div>
      <ErrorNote error={save.error} />
      <Button icon={UserPlus} loading={save.isPending} onClick={() => save.mutate()}>Save staff member</Button>
    </Card>
  );
}

export default function People() {
  const qc = useQueryClient();
  const { isAdmin } = useStaff();
  const [q, setQ] = useState('');
  const [staffOnly, setStaffOnly] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const people = useQuery({ queryKey: ['people', q, staffOnly], queryFn: () => admin.people(supabase, q, staffOnly) });
  const revoke = useMutation({ mutationFn: (id: string) => admin.revoke(supabase, id), onSuccess: () => qc.invalidateQueries({ queryKey: ['people'] }) });
  const refresh = () => { setOpen(null); setAdding(false); qc.invalidateQueries({ queryKey: ['people'] }); };

  return (
    <>
      <PageHeader title="People & roles" sub="Roles are granted here, never chosen by users. Every change is recorded in the audit log."
        actions={isAdmin ? <Button icon={UserPlus} variant={adding ? 'secondary' : 'primary'} onClick={() => setAdding(!adding)}>{adding ? 'Close' : 'Add staff member'}</Button> : null} />
      {adding ? <AddStaff onDone={refresh} /> : null}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="relative w-80"><Search className="size-4 absolute left-3 top-3 text-tx3" /><Input className="pl-9" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={staffOnly} onChange={(e) => setStaffOnly(e.target.checked)} /> Staff only</label>
      </div>
      <ErrorNote error={people.error ?? revoke.error} />
      {people.isLoading ? <Spinner /> : null}
      {people.data?.length === 0 ? <Card><Empty icon={Users} title="No one matches" /></Card> : null}
      <div className="space-y-3">
        {people.data?.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-60">
                <div className="font-semibold">{p.honorific ? `${p.honorific} ${p.last_name}` : p.name} <span className="text-tx2 font-normal">· {p.email}</span></div>
                <div className="text-sm text-tx2">{p.staff_title ?? (p.children.length ? `Guardian of ${p.children.join(', ')}` : 'No students linked')} · {p.signed_in ? 'Has signed in' : 'Not signed in yet'}</div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {p.memberships.map((m) => (
                    <span key={m.id} className="inline-flex items-center gap-1.5 rounded-lg bg-tint text-navy px-2 py-1 text-xs font-semibold">
                      {m.role === 'admin' || m.role === 'emergency_sender' ? <ShieldCheck className="size-3.5" /> : null}
                      {ROLE_LABELS[m.role]} · {m.scope_label}{m.ends_at ? ` · until ${new Date(m.ends_at).toLocaleDateString()}` : ''}
                      {isAdmin ? <button aria-label={`Remove ${ROLE_LABELS[m.role]}`} className="cursor-pointer" onClick={() => { if (confirm(`Remove ${ROLE_LABELS[m.role]} (${m.scope_label})?`)) revoke.mutate(m.id); }}><Trash2 className="size-3.5" /></button> : null}
                    </span>
                  ))}
                  {p.memberships.length === 0 && p.children.length ? <Badge>Parent</Badge> : null}
                </div>
              </div>
              {isAdmin ? <Button variant="secondary" icon={Plus} onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? 'Cancel' : 'Grant role'}</Button> : null}
            </div>
            {open === p.id ? <GrantForm person={p} onDone={refresh} /> : null}
          </Card>
        ))}
      </div>
    </>
  );
}
