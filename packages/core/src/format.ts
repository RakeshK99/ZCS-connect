// Small display helpers shared by app and console.

const DAY = 86_400_000;

/** "8:14 AM" today, "Yesterday", weekday this week, else "Oct 3". */
export function relativeTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (t >= startOfToday - DAY) return 'Yesterday';
  if (t >= startOfToday - 6 * DAY) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Day heading used in message threads: "Today", "Yesterday", "Monday", "Oct 3". */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return 'Today';
  if (t >= startOfToday - DAY) return 'Yesterday';
  if (t >= startOfToday - 6 * DAY) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** "06:30:00" → "6:30 AM" */
export function timeOfDay(hms: string | null | undefined): string {
  if (!hms) return '';
  const [h, m] = hms.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function initials(name: string): string {
  return name
    .replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join('')
    .slice(0, 2);
}

/** Local yyyy-mm-dd for a Date (calendar math stays in the school's local day). */
export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}
