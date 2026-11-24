// Public ZCS admissions links for families who aren't at ZCS yet (from zcs.org/admissions).
export const ADMISSIONS = {
  tour: 'https://www.zcs.org/tour/',
  inquire: 'https://www.zcs.org/inquire/',
  apply: 'https://www.zcs.org/apply/',
  email: 'admissions@zcs.org',
  phone: '616-772-2609',
  site: 'https://www.zcs.org/',
} as const;

// The links families use most on zcs.org/families (chosen with Peter Jenkins, Nov 19).
// Shown at the top of the School info tab.
export const FAMILY_LINKS = [
  { id: 'lunch-menu', label: 'Hot lunch menu', sub: 'This month’s menu', url: 'https://www.zcs.org/lunchmenu' },
  { id: 'lunch-account', label: 'Hot lunch account', sub: 'Add money and check the balance', url: 'https://hollandchristian.familyportal.cloud/' },
  { id: 'calendar-overview', label: 'Calendar overview', sub: '2026–27 school year at a glance', url: 'https://drive.google.com/file/d/1fNqASGTEqYAAaECQdVF94ZHjSPWHJKgQ/view' },
  { id: 'athletics', label: 'Athletics', sub: 'Teams and schedules', url: 'https://www.zcs.org/athletics/' },
  { id: 'enrollment', label: 'Enrollment portal', sub: 'Enrollment and tuition', url: 'https://www.zcs.org/enrollment-portal' },
] as const;
export const FAMILIES_PAGE = 'https://www.zcs.org/families/';
