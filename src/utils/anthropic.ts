import { supabase } from '../lib/supabase';

export async function callOpenAI(system: string, userMessage: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('golf-coach', {
    body: {
      system,
      userMessage,
    },
  });
  if (error) throw error;
  if (!data?.text || typeof data.text !== 'string') {
    throw new Error('AI coach returned an invalid response');
  }
  return data.text;
}

export function buildDebriefPrompt(stats: {
  totalScore: number;
  toPar: number;
  girPct: number;
  firPct: number;
  totalPutts: number;
  handicapIndex?: number | null;
  courseName: string;
  differential?: number | null;
}): { system: string; user: string } {
  const system =
    'You are a concise golf coach. Give exactly 3 plain-English improvement tips as a numbered list. ' +
    'Each tip must be one sentence, specific, and actionable. Use metres. No preamble.';

  const user =
    `Post-round summary for ${stats.courseName}:\n` +
    `Score: ${stats.totalScore} (${stats.toPar >= 0 ? '+' : ''}${stats.toPar} vs par)\n` +
    `GIR: ${stats.girPct}%  FIR: ${stats.firPct}%  Putts: ${stats.totalPutts}\n` +
    (stats.handicapIndex != null ? `Handicap: ${stats.handicapIndex}\n` : '') +
    (stats.differential != null ? `Differential: ${stats.differential.toFixed(1)}\n` : '') +
    '\nGive 3 improvement tips.';

  return { system, user };
}

export function buildBriefingPrompt(params: {
  courseName: string;
  courseRating: number;
  slopeRating: number;
  teeColour: string;
  windLabel: string;
  handicapIndex?: number | null;
}): { system: string; user: string } {
  const system =
    'You are a golf caddie giving a pre-round briefing. Give exactly 3 strategic tips as a numbered list. ' +
    'Each tip must be one sentence, course-specific, and practical. Use metres. No preamble.';

  const user =
    `Pre-round briefing for ${params.courseName} (${params.teeColour} tees, rating ${params.courseRating}, slope ${params.slopeRating}).\n` +
    `Conditions: ${params.windLabel}.\n` +
    (params.handicapIndex != null ? `Player handicap: ${params.handicapIndex}.\n` : '') +
    "\nGive 3 strategic tips for today's round.";

  return { system, user };
}
