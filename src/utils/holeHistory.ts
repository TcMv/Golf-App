import { supabase } from '../lib/supabase';

export type HoleHistorySummary = {
  count: number;
  avg: number;
  best: number;
  girPct: number;
  avgPutts: number;
};

export async function fetchHoleHistory(
  userId: string,
  courseId: string,
  holeNumber: number,
): Promise<HoleHistorySummary | null> {
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('completed', true)
    .order('date', { ascending: false })
    .limit(20);

  if (!rounds?.length) return null;

  const ids = rounds.map((r: { id: string }) => r.id);
  const { data: scores } = await supabase
    .from('hole_scores')
    .select('gross_score, putts, gir')
    .in('round_id', ids)
    .eq('hole_number', holeNumber)
    .not('gross_score', 'is', null);

  if (!scores?.length) return null;

  const n = scores.length;
  const avg = scores.reduce((s: number, r: any) => s + r.gross_score, 0) / n;
  const best = Math.min(...scores.map((r: any) => r.gross_score as number));
  const girPct = Math.round(scores.filter((r: any) => r.gir).length / n * 100);
  const avgPutts = scores.reduce((s: number, r: any) => s + (r.putts ?? 2), 0) / n;

  return { count: n, avg, best, girPct, avgPutts };
}

export function historyToContext(h: HoleHistorySummary, holeNumber: number): string {
  return (
    `History on hole ${holeNumber} (${h.count} rounds): ` +
    `avg ${h.avg.toFixed(1)}, best ${h.best}, GIR ${h.girPct}%, avg ${h.avgPutts.toFixed(1)} putts.`
  );
}
