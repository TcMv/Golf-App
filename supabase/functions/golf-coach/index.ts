const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type CoachRequest = {
  system?: unknown;
  userMessage?: unknown;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function extractText(response: {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}): string | null {
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) {
        return content.text.trim();
      }
    }
  }
  return null;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!request.headers.get('Authorization')) {
    return json({ error: 'Authentication required' }, 401);
  }

  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAiKey) {
    return json({ error: 'AI service is not configured' }, 503);
  }

  let body: CoachRequest;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (
    typeof body.system !== 'string'
    || typeof body.userMessage !== 'string'
    || body.system.length === 0
    || body.system.length > 1_500
    || body.userMessage.length === 0
    || body.userMessage.length > 4_000
  ) {
    return json({ error: 'Invalid prompt' }, 400);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        instructions: body.system,
        input: body.userMessage,
        max_output_tokens: 400,
      }),
    });

    if (!response.ok) {
      const requestId = response.headers.get('x-request-id');
      return json({
        error: 'AI service request failed',
        requestId,
      }, 502);
    }

    const result = await response.json();
    const text = extractText(result);
    if (!text) {
      return json({ error: 'AI service returned no text' }, 502);
    }

    return json({ text });
  } catch {
    return json({ error: 'AI service is unavailable' }, 502);
  }
});
