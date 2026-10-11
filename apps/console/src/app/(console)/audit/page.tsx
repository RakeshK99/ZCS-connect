'use client';
import { useQuery } from '@tanstack/react-query';
import { admin } from '@zcs/core';
import { ScrollText, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Badge, Card, Empty, ErrorNote, PageHeader, Select, Spinner } from '@/components/ui';
import { useStaff } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const FILTERS = [
  { id: '', label: 'Everything' }, { id: 'oversight', label: 'Conversation reviews' }, { id: 'membership', label: 'Role changes' },
  { id: 'post', label: 'Announcements' }, { id: 'roster', label: 'Roster imports' }, { id: 'family_request', label: 'Family requests' },
  { id: 'account', label: 'Accounts' }, { id: 'calendar', label: 'Calendar' },
];

export default function Audit() {
  const { isAdmin } = useStaff();
  const [filter, setFilter] = useState('');
  const log = useQuery({ queryKey: ['audit', filter], queryFn: () => admin.audit(supabase, filter), enabled: isAdmin });
  const people = useQuery({ queryKey: ['people', '', false], queryFn: () => admin.people(supabase, '', false), enabled: isAdmin });
  const nameOf = (id: string | null) => people.data?.find((p) => p.id === id)?.name ?? 'System';

  if (!isAdmin) return <Card><Empty icon={ShieldAlert} title="Admins only" /></Card>;
  return (
    <>
      <PageHeader title="Audit log" sub="An append-only record of sends, role changes, roster imports and conversation reviews."
        actions={<Select value={filter} onChange={(e) => setFilter(e.target.value)}>{FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>} />
      <ErrorNote error={log.error} />
      {log.isLoading ? <Spinner /> : null}
      {log.data?.length === 0 ? <Card><Empty icon={ScrollText} title="Nothing recorded yet" /></Card> : null}
      {log.data?.length ? (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sf2 text-left text-tx2"><tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Who</th><th className="px-4 py-2.5">What</th><th className="px-4 py-2.5">Details</th></tr></thead>
            <tbody>
              {log.data.map((r) => (
                <tr key={r.id} className="border-t border-bd align-top">
                  <td className="px-4 py-2.5 whitespace-nowrap text-tx2">{new Date(r.at).toLocaleString()}</td>
                  <td className="px-4 py-2.5 font-semibold">{nameOf(r.actor_id)}</td>
                  <td className="px-4 py-2.5"><Badge tone={r.action.startsWith('oversight') ? 'maize' : 'neutral'}>{r.action}</Badge></td>
                  <td className="px-4 py-2.5 text-tx2 font-mono text-xs break-all">{Object.keys(r.detail ?? {}).length ? JSON.stringify(r.detail) : r.target_id ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </>
  );
}
