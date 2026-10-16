'use client';
import { useQuery } from '@tanstack/react-query';
import { admin } from '@zcs/core';
import { CalendarDays, FileSpreadsheet, LayoutDashboard, LogOut, MessagesSquare, ScrollText, SquarePen, UserPlus, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { cx, Spinner } from '@/components/ui';
import { useConsole } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Nav = { href: string; label: string; icon: LucideIcon; show: boolean; badge?: number };

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { ready, auth, me, staff, error, signOut } = useConsole();
  useEffect(() => { if (ready && (!auth || error)) router.replace('/login'); }, [ready, auth, error, router]);

  const office = !!me?.is_office;
  const pending = useQuery({ queryKey: ['stats'], queryFn: () => admin.stats(supabase), enabled: office, refetchInterval: 60_000 }).data?.pending_requests ?? 0;
  if (!ready || !me || !staff) return <Spinner />;

  const principal = staff.roles.includes('principal');
  const nav: Nav[] = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard, show: office || principal },
    { href: '/compose', label: 'New announcement', icon: SquarePen, show: true },
    { href: '/families', label: 'Family requests', icon: UserPlus, show: office, badge: pending },
    { href: '/roster', label: 'Roster import', icon: FileSpreadsheet, show: office },
    { href: '/people', label: 'People & roles', icon: Users, show: office },
    { href: '/calendar', label: 'School calendar', icon: CalendarDays, show: office },
    { href: '/conversations', label: 'Conversation review', icon: MessagesSquare, show: me.is_admin },
    { href: '/audit', label: 'Audit log', icon: ScrollText, show: me.is_admin },
  ];

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 shrink-0 bg-navy text-white flex flex-col sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-5 h-16">
          <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/zcs-icon-maize.svg`} alt="" className="size-8" />
          <div>
            <div className="font-heading font-bold text-lg leading-none">ZCS Connect</div>
            <div className="text-white/60 text-xs mt-1">Staff console</div>
          </div>
        </div>
        <nav aria-label="Console" className="flex-1 px-3 py-2 space-y-1">
          {nav.filter((n) => n.show).map((n) => {
            const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined}
                className={cx('flex items-center gap-3 rounded-xl px-3 h-10 text-[15px] font-medium', active ? 'bg-white/12 text-maize' : 'text-white/85 hover:bg-white/8')}>
                <n.icon className="size-[18px]" />
                <span className="flex-1">{n.label}</span>
                {n.badge ? <span className="min-w-5 h-5 rounded-full bg-maize text-navy text-xs font-bold flex items-center justify-center px-1.5">{n.badge}</span> : null}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="text-sm font-semibold">{me.person.full_name}</div>
          <div className="text-xs text-white/60 truncate">{staff.label}</div>
          <button onClick={async () => { await signOut(); router.replace('/login'); }} className="mt-3 flex items-center gap-2 text-sm text-white/80 hover:text-white cursor-pointer">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-8 py-8 max-w-6xl">{children}</main>
    </div>
  );
}
