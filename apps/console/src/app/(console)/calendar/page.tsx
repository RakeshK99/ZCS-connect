'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { admin, api, isoDay, timeOfDay, type CalendarEvent } from '@zcs/core';
import { CalendarDays, Link2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, Empty, ErrorNote, Input, Label, PageHeader, Spinner } from '@/components/ui';
import { supabase } from '@/lib/supabase';

type Draft = { id?: string | null; title: string; starts_on: string; ends_on: string; start_time: string; end_time: string; location: string; no_school: boolean };
const blank = (): Draft => ({ title: '', starts_on: isoDay(new Date()), ends_on: '', start_time: '', end_time: '', location: '', no_school: false });

export default function CalendarAdmin() {
  const qc = useQueryClient();
  const from = new Date(new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0), 6, 1);
  const to = new Date(from.getFullYear() + 1, 6, 31);
  const events = useQuery({ queryKey: ['calendar-admin'], queryFn: () => api.calendar(supabase, isoDay(from), isoDay(to)) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const save = useMutation({
    mutationFn: (d: Draft) => admin.upsertEvent(supabase, { ...d, title: d.no_school && !d.title.startsWith('No school') ? `No school · ${d.title}` : d.title }),
    onSuccess: () => { setDraft(null); qc.invalidateQueries({ queryKey: ['calendar-admin'] }); },
  });
  const del = useMutation({ mutationFn: (id: string) => admin.deleteEvent(supabase, id), onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-admin'] }) });
  const source = useQuery({ queryKey: ['calendar-source'], queryFn: () => admin.calendarSource(supabase), refetchInterval: 20_000 });
  const [url, setUrl] = useState('');
  const connect = useMutation({
    mutationFn: (u: string | null) => admin.setCalendarSource(supabase, u),
    onSuccess: () => { setUrl(''); qc.invalidateQueries({ queryKey: ['calendar-source'] }); setTimeout(() => qc.invalidateQueries({ queryKey: ['calendar-admin'] }), 8000); },
  });
  const syncNow = useMutation({
    mutationFn: () => admin.syncCalendarNow(supabase),
    onSuccess: () => setTimeout(() => { qc.invalidateQueries({ queryKey: ['calendar-source'] }); qc.invalidateQueries({ queryKey: ['calendar-admin'] }); }, 8000),
  });
  const edit = (e: CalendarEvent) => setDraft({ id: e.id, title: e.title.replace(/^No school · /, ''), starts_on: e.starts_on, ends_on: e.ends_on ?? '',
    start_time: e.start_time?.slice(0, 5) ?? '', end_time: e.end_time?.slice(0, 5) ?? '', location: e.location ?? '', no_school: e.no_school });

  const byMonth = (events.data ?? []).reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    const k = new Date(`${e.starts_on}T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    (acc[k] ??= []).push(e);
    return acc;
  }, {});

  return (
    <>
      <PageHeader title="School calendar" sub="The academic calendar families see in the app: school days off, conferences and events."
        actions={<Button icon={Plus} onClick={() => setDraft(blank())}>Add event</Button>} />
      <Card className="p-5 mb-6">
        <div className="flex items-start gap-3">
          <Link2 className="mt-0.5 shrink-0" size={20} />
          <div className="flex-1 space-y-2">
            <div className="font-semibold">ZCS Google Calendar</div>
            {source.data?.connected ? (
              <>
                <p className="text-sm text-tx2">
                  Connected. School events come from Google Calendar every 15 minutes; change them there.
                  {source.data.last_synced_at ? ` Last checked ${new Date(source.data.last_synced_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ' Waiting for the first sync'}
                  {source.data.last_error ? '.' : ` · ${source.data.synced_events ?? 0} events.`}
                </p>
                {source.data.last_error ? <p className="text-sm text-emergency">Last sync failed: {source.data.last_error}</p> : null}
                <div className="flex gap-2">
                  <Button variant="secondary" icon={RefreshCw} loading={syncNow.isPending} onClick={() => syncNow.mutate()}>Sync now</Button>
                  <Button variant="ghost" onClick={() => { if (confirm('Disconnect Google Calendar? Synced events stay until you reconnect or delete them.')) connect.mutate(null); }}>Disconnect</Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-tx2">
                  In Google Calendar, open the school calendar&apos;s <b>Settings and sharing</b>, copy <b>Secret address in iCal format</b>, and paste it here.
                  Events then sync every 15 minutes.
                </p>
                <div className="flex gap-2">
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" aria-label="Secret iCal address" />
                  <Button loading={connect.isPending} disabled={!url.trim()} onClick={() => connect.mutate(url.trim())}>Connect</Button>
                </div>
              </>
            )}
            <ErrorNote error={connect.error ?? syncNow.error} />
          </div>
        </div>
      </Card>
      {draft ? (
        <Card className="p-5 mb-6 space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2"><Label>Title</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Partnership Night" /></div>
            <div><Label>Location</Label><Input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="Gym" /></div>
            <div><Label>Date</Label><Input type="date" value={draft.starts_on} onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })} /></div>
            <div><Label>Through (optional)</Label><Input type="date" value={draft.ends_on} onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Starts</Label><Input type="time" value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} /></div>
              <div><Label>Ends</Label><Input type="time" value={draft.end_time} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} /></div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[15px] cursor-pointer"><input type="checkbox" checked={draft.no_school} onChange={(e) => setDraft({ ...draft, no_school: e.target.checked })} /> No school (all ZCS buildings)</label>
          <ErrorNote error={save.error} />
          <div className="flex gap-2"><Button loading={save.isPending} disabled={!draft.title || !draft.starts_on} onClick={() => save.mutate(draft)}>Save</Button>
            <Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button></div>
        </Card>
      ) : null}
      {events.isLoading ? <Spinner /> : null}
      <ErrorNote error={events.error ?? del.error} />
      {events.data?.length === 0 ? <Card><Empty icon={CalendarDays} title="No events yet" body="Add the first day of school, breaks and conferences." /></Card> : null}
      {Object.entries(byMonth).map(([month, list]) => (
        <div key={month} className="mb-6">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-tx2 font-sans mb-2">{month}</h2>
          <Card>
            {list.map((e) => (
              <div key={e.id} className="flex items-center gap-4 px-4 py-3 border-t first:border-t-0 border-bd">
                <div className="w-24 text-sm font-semibold">{new Date(`${e.starts_on}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                <div className="flex-1"><div className="font-semibold">{e.title.replace(/^No school · /, '')}</div>
                  <div className="text-sm text-tx2">{e.ends_on ? `Through ${e.ends_on} · ` : ''}{e.start_time ? `${timeOfDay(e.start_time)}${e.end_time ? ` – ${timeOfDay(e.end_time)}` : ''}` : 'All day'}{e.location ? ` · ${e.location}` : ''}</div></div>
                {e.no_school ? <Badge>No school</Badge> : null}
                {e.audience_label ? <Badge tone="navy">Class · {e.audience_label}</Badge> : null}
                {e.source === 'ics' ? <Badge tone="ok">Google Calendar</Badge> : (
                  <>
                    <Button variant="ghost" icon={Pencil} onClick={() => edit(e)} aria-label={`Edit ${e.title}`} />
                    <Button variant="ghost" icon={Trash2} onClick={() => { if (confirm(`Delete "${e.title}"?`)) del.mutate(e.id); }} aria-label={`Delete ${e.title}`} />
                  </>
                )}
              </div>
            ))}
          </Card>
        </div>
      ))}
    </>
  );
}
