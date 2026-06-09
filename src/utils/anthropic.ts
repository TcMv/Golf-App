const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';

export async function callOpenAI(system: string, userMessage: string): Promise<string> {
  if (!OPENAI_KEY) {
    return 'Add EXPO_PUBLIC_OPENAI_API_KEY to your .env file to enable AI tips.';
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 400,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}`);
  const json = await res.json();
  return (json.choices?.[0]?.message?.content as string) ?? 'No response.';
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
