'use client';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Button({ variant = 'primary', icon: Icon, loading, className, children, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'maize'; icon?: LucideIcon; loading?: boolean }) {
  const v = {
    primary: 'bg-navy text-white hover:bg-navy-900 font-heading font-bold',
    secondary: 'bg-sf text-tx border border-bds hover:bg-sf2 font-semibold',
    ghost: 'text-navy hover:bg-tint font-semibold',
    danger: 'bg-emergency text-white hover:opacity-90 font-heading font-bold',
    maize: 'bg-maize text-navy hover:brightness-95 font-heading font-bold',
  }[variant];
  return (
    <button {...p} disabled={p.disabled || loading}
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl px-4 h-10 text-[15px] transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer', v, className)}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-4" /> : null}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('bg-sf border border-bd rounded-2xl', className)}>{children}</div>;
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-[28px] leading-tight font-bold text-tx">{title}</h1>
        {sub ? <p className="text-tx2 mt-1 text-[15px]">{sub}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-tx2 mb-1.5">{children}</label>;
}

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx('w-full h-10 rounded-xl border border-bds bg-sf px-3 text-[15px] text-tx placeholder:text-tx3', p.className)} />;
}

export function Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx('w-full rounded-xl border border-bds bg-sf px-3 py-2.5 text-[15px] text-tx placeholder:text-tx3 resize-y', p.className)} />;
}

export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx('h-10 rounded-xl border border-bds bg-sf px-3 text-[15px] text-tx', p.className)} />;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'navy' | 'maize' | 'ok' | 'red'; children: ReactNode }) {
  const t = { neutral: 'bg-sf2 text-tx', navy: 'bg-navy text-white', maize: 'bg-maize text-navy', ok: 'bg-okbg text-ok', red: 'bg-emergency text-white' }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold whitespace-nowrap', t)}>{children}</span>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[13px] font-semibold uppercase tracking-wide text-tx2 font-sans mb-2 mt-6">{children}</h2>;
}

export function Empty({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-14 px-6">
      <div className="size-16 rounded-full bg-tint text-navy flex items-center justify-center"><Icon className="size-7" /></div>
      <div className="font-heading font-bold text-lg">{title}</div>
      {body ? <p className="text-tx2 max-w-md">{body}</p> : null}
    </div>
  );
}

export function ReachBar({ reached, read, families }: { reached: number; read: number; families: number }) {
  const r = families ? (read / families) * 100 : 0;
  const d = families ? ((reached - read) / families) * 100 : 0;
  return (
    <div role="img" aria-label={`${reached} of ${families} families reached, ${read} read`} className="h-2 rounded-full bg-sf2 overflow-hidden flex">
      <div className="bg-navy" style={{ width: `${r}%` }} />
      <div className="bg-navy/35" style={{ width: `${Math.max(0, d)}%` }} />
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <div role="alert" className="rounded-xl bg-[#FDECEA] text-[#7A1A14] px-4 py-3 text-sm">{(error as Error).message ?? String(error)}</div>;
}

export function Spinner() {
  return <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-tx3" /></div>;
}

export { cx };
