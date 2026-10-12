'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fileSize, type AudienceOption, type Priority } from '@zcs/core';
import { FileText, Image as ImageIcon, Paperclip, Pin, Send, Siren, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, Empty, ErrorNote, Input, Label, PageHeader, Textarea, cx } from '@/components/ui';
import { useStaff } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const MAX = 25 * 1024 * 1024;
const key = (a: AudienceOption) => `${a.type}:${a.id ?? ''}`;

export default function Compose() {
  const router = useRouter();
  const qc = useQueryClient();
  const { me, canEmergency } = useStaff();
  const audiences = useQuery({ queryKey: ['audiences'], queryFn: () => api.myAudiences(supabase) });
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [ack, setAck] = useState(false);
  const [schedule, setSchedule] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [confirmEmergency, setConfirmEmergency] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const options = audiences.data ?? [];
  const chosen = options.filter((o) => picked.includes(key(o)));
  const toggle = (o: AudienceOption) => setPicked((p) => (p.includes(key(o)) ? p.filter((x) => x !== key(o)) : [...p, key(o)]));

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const ok = Array.from(list).filter((f) => f.size <= MAX && (f.type.startsWith('image/') || f.type === 'application/pdf'));
    if (ok.length < list.length) setError(new Error('Only photos and PDFs under 25 MB can be attached.'));
    setFiles((f) => [...f, ...ok].slice(0, 10));
  };

  const send = async () => {
    setError(null);
    if (!chosen.length) return setError(new Error('Choose who this is for.'));
    if (!title.trim()) return setError(new Error('Add a title.'));
    if (priority === 'emergency' && !confirmEmergency) return setConfirmEmergency(true);
    try {
      setBusy(true);
      const attachments = await Promise.all(files.map(async (f, i) => {
        const path = `${me.school.id}/${me.person.id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]/g, '_')}`;
        const { error } = await supabase.storage.from('attachments').upload(path, f, { contentType: f.type });
        if (error) throw new Error(`Upload failed for ${f.name}: ${error.message}`);
        return { storage_path: path, kind: f.type === 'application/pdf' ? 'pdf' as const : 'image' as const, file_name: f.name, size_bytes: f.size, sort_order: i };
      }));
      const res = await api.createPost(supabase, {
        title: title.trim(), body: body.trim(), audience: chosen.map((a) => ({ type: a.type, id: a.id })), priority, requireAck: ack,
        scheduledAt: schedule ? new Date(schedule).toISOString() : null, attachments,
      });
      qc.invalidateQueries({ queryKey: ['recent-sends'] });
      router.push(`/posts/view?id=${res.id}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      setConfirmEmergency(false);
    }
  };

  if (audiences.isSuccess && options.length === 0) {
    return (
      <>
        <PageHeader title="New announcement" />
        <Card><Empty icon={Send} title="Your role doesn’t send announcements" body="Sending is for the office, principals and teachers. An admin can grant the office role in People & roles if you need it." /></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="New announcement" sub="Families get a notification right away, and an email if they haven’t opened it within 15 minutes." />
      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <Card className="p-6 space-y-5">
          <div>
            <Label>Who is this for?</Label>
            <div className="flex flex-wrap gap-2">
              {options.map((o) => {
                const on = picked.includes(key(o));
                return (
                  <button key={key(o)} type="button" aria-pressed={on} onClick={() => toggle(o)}
                    className={cx('h-9 px-3.5 rounded-full border text-sm font-semibold cursor-pointer', on ? 'bg-navy text-white border-navy' : 'bg-sf border-bds text-tx hover:bg-sf2')}>
                    {o.label}
                  </button>
                );
              })}
              {audiences.isLoading ? <span className="text-sm text-tx3">Loading…</span> : null}
            </div>
          </div>
          <div><Label htmlFor="title">Title</Label><Input id="title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Early dismissal Friday at 12:30" /></div>
          <div><Label htmlFor="body">Message</Label><Textarea id="body" rows={8} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What do families need to know?" /></div>

          <div>
            <Label>Attachments</Label>
            <label className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-dashed border-bds cursor-pointer hover:bg-sf2 text-sm font-semibold">
              <Paperclip className="size-4" /> Add photos or PDFs
              <input type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={(e) => addFiles(e.target.files)} />
            </label>
            {files.length ? (
              <ul className="mt-3 space-y-2">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl bg-bg px-3 py-2 text-sm">
                    {f.type === 'application/pdf' ? <FileText className="size-4 text-navy" /> : <ImageIcon className="size-4 text-navy" />}
                    <span className="flex-1 truncate">{f.name}</span><span className="text-tx3">{fileSize(f.size)}</span>
                    <button aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="cursor-pointer"><X className="size-4" /></button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-5">
            <fieldset>
              <legend className="text-[13px] font-semibold text-tx2 mb-1.5">Priority</legend>
              <div className="flex gap-2">
                {(['normal', 'important', ...(canEmergency ? ['emergency'] : [])] as Priority[]).map((p) => (
                  <button key={p} type="button" aria-pressed={priority === p} onClick={() => setPriority(p)}
                    className={cx('h-9 px-3 rounded-xl border text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer',
                      priority === p ? (p === 'emergency' ? 'bg-emergency text-white border-emergency' : p === 'important' ? 'bg-maize text-navy border-maize' : 'bg-navy text-white border-navy') : 'border-bds')}>
                    {p === 'emergency' ? <Siren className="size-4" /> : p === 'important' ? <Pin className="size-4" /> : null}
                    {p[0]!.toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <Label htmlFor="schedule">Send later (optional)</Label>
              <Input id="schedule" type="datetime-local" value={schedule} disabled={priority === 'emergency'} onChange={(e) => setSchedule(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-3 text-[15px] cursor-pointer">
            <input type="checkbox" className="size-5 accent-[#041E42]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            Ask families to confirm they&apos;ve read this
          </label>
          <ErrorNote error={error} />
          {confirmEmergency ? (
            <div role="alertdialog" className="rounded-2xl border-2 border-emergency p-4 space-y-3">
              <p className="font-semibold">Send as an emergency alert?</p>
              <p className="text-sm text-tx2">It bypasses quiet hours and goes out by notification and email to everyone in the audience right away. Use it only for safety and closures.</p>
              <div className="flex gap-2"><Button variant="danger" icon={Siren} loading={busy} onClick={send}>Yes, send emergency alert</Button><Button variant="secondary" onClick={() => setConfirmEmergency(false)}>Cancel</Button></div>
            </div>
          ) : (
            <Button variant={priority === 'emergency' ? 'danger' : 'primary'} icon={Send} loading={busy} onClick={send} className="h-12 px-6">
              {schedule ? 'Schedule announcement' : priority === 'emergency' ? 'Send emergency alert' : 'Send announcement'}
            </Button>
          )}
        </Card>

        <div className="space-y-3 lg:sticky lg:top-8">
          <div className="text-[13px] font-semibold uppercase tracking-wide text-tx2">Preview as a parent</div>
          <div className={cx('rounded-2xl border bg-sf p-4 space-y-2', priority === 'important' ? 'border-maize' : 'border-bd', priority === 'emergency' && 'bg-emergency text-white border-emergency')}>
            <div className="flex items-center gap-2">
              <div className={cx('size-9 rounded-full flex items-center justify-center font-heading font-bold text-sm', priority === 'emergency' ? 'bg-white/20' : 'bg-navy text-maize')}>
                {(me.person.display_name.replace(/^(Mr|Mrs|Ms|Dr)\.\s*/, '')[0] ?? 'Z').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{chosen.some((c) => c.type === 'school' || c.type === 'staff') && me.is_office ? 'ZCS Office' : me.person.display_name}</div>
                <div className={cx('text-xs truncate', priority === 'emergency' ? 'text-white/80' : 'text-tx2')}>{chosen.map((c) => c.label).join(', ') || 'Choose an audience'} · now</div>
              </div>
              {priority === 'important' ? <Badge tone="maize"><Pin className="size-3" />Important</Badge> : null}
            </div>
            <div className="font-heading font-bold text-lg leading-snug">{title || 'Your title'}</div>
            <p className={cx('text-sm whitespace-pre-wrap line-clamp-6', priority === 'emergency' ? 'text-white/90' : 'text-tx2')}>{body || 'Your message'}</p>
            {ack ? <div className="text-xs font-semibold text-navy">Please confirm you&apos;ve read this</div> : null}
          </div>
        </div>
      </div>
    </>
  );
}
