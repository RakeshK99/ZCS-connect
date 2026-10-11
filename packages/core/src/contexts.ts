import type { AppContext, ContextKey, LinkedSession, ParentContext, StaffContext } from './types';

export function getContext(session: LinkedSession, key: ContextKey | null | undefined): AppContext | null {
  return session.contexts.find((c) => c.key === key) ?? session.contexts[0] ?? null;
}

export const isParent = (c: AppContext | null): c is ParentContext => c?.key === 'parent';
export const isStaff = (c: AppContext | null): c is StaffContext => c?.key === 'staff';

/** Teachers/aides/group leaders get the Classes tab. */
export function hasClasses(c: AppContext | null): boolean {
  return isStaff(c) && c.classes.length > 0;
}

/** Can this staff context compose posts at all? (server re-checks every audience) */
export function canCompose(c: AppContext | null): boolean {
  if (!isStaff(c)) return false;
  return c.classes.length > 0 || c.roles.some((r) => r === 'office' || r === 'principal' || r === 'emergency_sender');
}

/** "Emma's and Noah's" for copy in empty states. */
export function childrenPossessive(c: ParentContext): string {
  const names = c.children.map((k) => `${k.name}'s`);
  if (names.length <= 1) return names[0] ?? 'your children\'s';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
