export function profileInitials(displayName: string | null | undefined, email?: string | null): string {
  const source = displayName?.trim() || email?.split('@')[0] || 'Golfer';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts.at(-1)?.[0] ?? ''}`.toUpperCase();
}

export function normalizeGhin(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
