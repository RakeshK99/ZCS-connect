'use client';
import { useQuery } from '@tanstack/react-query';
import { admin, pct, relativeTime } from '@zcs/core';
import { Megaphone, SquarePen, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, ReachBar, SectionTitle, Spinner } from '@/components/ui';
import { useStaff } from '@/lib/session';
import { supabase } from '@/lib/supabase';

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="text-[13px] font-semibold uppercase tracking-wide text-tx2">{label}</div>
      <div className="font-heading font-bold text-3xl mt-1">{value}</div>
      {sub ? <div className="text-sm text-tx2 mt-1">{sub}</div> : null}
    </Card>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { isOffice, isPrincipal } = useStaff();
  useEffect(() => { if (!isOffice && !isPrincipal) router.replace('/compose'); }, [isOffice, isPrincipal, router]);
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => admin.stats(supabase), enabled: isOffice });
  const sends = useQuery({ queryKey: ['recent-sends'], queryFn: () => admin.recentSends(supabase, 30), refetchInterval: 15_000 });
  const s = stats.data;

  return (
    <>
      <PageHeader title="Dashboard" sub="Everything sent recently and how many families it reached."
        actions={<Link href="/compose"><Button icon={SquarePen}>New announcement</Button></Link>} />
      {s ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Students" value={s.students} />
          <Stat label="Families with the app" value={`${pct(s.families_with_app, s.students)}%`} sub={`${s.families_with_app} of ${s.students} students`} />
          <Stat label="Guardians signed in" value={`${s.guardians_signed_in} / ${s.guardians}`} />
          <Link href="/families"><Stat label="Family requests" value={s.pending_requests} sub={s.pending_requests ? 'Waiting for the office' : 'All caught up'} /></Link>
        </div>
      ) : null}
      {s && s.pending_requests > 0 ? (
        <Link href="/families" className="mt-4 flex items-center gap-3 rounded-2xl bg-maize/90 text-navy px-5 py-3 font-semibold">
          <UserPlus className="size-5" /> {s.pending_requests} {s.pending_requests === 1 ? 'family is' : 'families are'} waiting to be connected
        </Link>
      ) : null}

      <SectionTitle>Recent announcements</SectionTitle>
      <ErrorNote error={sends.error} />
      {sends.isLoading ? <Spinner /> : null}
      {sends.data && sends.data.length === 0 ? <Card><Empty icon={Megaphone} title="Nothing sent yet" body="Announcements you and other staff send will show up here with their reach." /></Card> : null}
      {sends.data?.length ? (
        <Card className="overflow-hidden">
          <table className="w-full text-[15px]">
            <thead className="bg-sf2 text-left text-[13px] text-tx2">
              <tr><th className="px-4 py-2.5 font-semibold">Announcement</th><th className="px-4 py-2.5 font-semibold">Audience</th><th className="px-4 py-2.5 font-semibold w-64">Reach</th><th className="px-4 py-2.5 font-semibold">Sent</th></tr>
            </thead>
            <tbody>
              {sends.data.map((p) => (
                <tr key={p.id} className="border-t border-bd hover:bg-bg cursor-pointer" onClick={() => router.push(`/posts/view?id=${p.id}`)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {p.priority === 'emergency' ? <Badge tone="red">Emergency</Badge> : p.priority === 'important' ? <Badge tone="maize">Important</Badge> : null}
                      {p.status === 'scheduled' ? <Badge>Scheduled</Badge> : null}
                      <Link href={`/posts/view?id=${p.id}`} className="font-semibold hover:underline">{p.title}</Link>
                    </div>
                    <div className="text-sm text-tx2">{p.author}</div>
                  </td>
                  <td className="px-4 py-3 text-tx2">{p.audience_label}</td>
                  <td className="px-4 py-3">
                    {p.reach ? (
                      <div className="space-y-1.5"><ReachBar {...p.reach} /><div className="text-sm text-tx2">{p.reach.reached} of {p.reach.families} reached · {p.reach.read} read</div></div>
                    ) : <span className="text-sm text-tx3">—</span>}
                  </td>
                  <td className="px-4 py-3 text-tx2 whitespace-nowrap">{p.sent_at ? relativeTime(p.sent_at) : p.scheduled_at ? `Scheduled ${new Date(p.scheduled_at).toLocaleString()}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </>
  );
}
