export const ADMIN_EMAILS = new Set([
  'tarancroxton@gmail.com',
  'tarancroxton@outlook.com',
]);

export function isAdminEmail(email: string | null | undefined): boolean {
  return ADMIN_EMAILS.has(email?.trim().toLowerCase() ?? '');
}
