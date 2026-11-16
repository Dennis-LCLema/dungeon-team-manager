/* AI relay for Dungeon Team Manager, run as a Cloudflare Worker.

   The game site is public, so it can't hold the Claude API key. This relay holds it instead: the app sends a
   request here, and the relay forwards it to Claude and passes the JSON answer back.

   Set two secrets on the Worker (Settings > Variables and Secrets), both of type "Secret":
     ANTHROPIC_API_KEY   your key from console.anthropic.com
     GAME_CODE           the same game code your group types into the app

   A request is only forwarded when it comes from the game site and carries the right game code, and the model,
   answer length and request size are fixed here, so a leaked relay address can't be used as a free Claude account.
   This file calls the API with plain fetch because a Worker pasted into the Cloudflare dashboard can't install the SDK.

   shortcut: no per-player rate limit; the monthly spend limit in the Anthropic console is the backstop. Add a
   Cloudflare rate-limiting rule if the game code ever spreads beyond the group. */

const SITE = 'https://dennis-lclema.github.io';
const MODEL = 'claude-opus-5-5';
// Thinking is always on for this model; effort sets how long it thinks. "low" keeps table rulings quick.
const EFFORT = 'low';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = origin === SITE || /^http:\/\/localhost(:\d+)?$/.test(origin);
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : SITE,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      Vary: 'Origin',
    };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST' || !allowed) return reply(403, { error: 'This relay only answers the game site.' });
    if (!env.ANTHROPIC_API_KEY || !env.GAME_CODE) return reply(500, { error: 'The relay is missing its ANTHROPIC_API_KEY or GAME_CODE secret.' });

    let body;
    try { body = await request.json(); } catch { return reply(400, { error: 'The request was not valid JSON.' }); }
    if (body.code !== env.GAME_CODE) return reply(403, { error: 'Wrong game code.' });
    const { system, user, schema } = body;
    if (typeof system !== 'string' || typeof user !== 'string' || !schema || typeof schema !== 'object') return reply(400, { error: 'The request needs system, user and schema.' });
    if (system.length + user.length > 24000) return reply(413, { error: 'The request is too long.' });

    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2026-10-21',
          // If a safety check declines a request, the API retries it on a fallback model inside the same call.
          'anthropic-beta': 'server-side-fallback-2026-07-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4000,
          fallbacks: 'default',
          // The schema makes the answer valid JSON in the shape the app asked for.
          output_config: { effort: EFFORT, format: { type: 'json_schema', schema } },
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
    } catch {
      return reply(502, { error: 'Could not reach Claude. Try again.' });
    }

    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      // 429 and 5xx are worth retrying; 400 and 401 mean the relay or the key needs fixing.
      const retry = res.status === 429 || res.status >= 500;
      return reply(retry ? 503 : 502, { error: data?.error?.message || `Claude returned an error (${res.status}).`, retry });
    }
    if (data.stop_reason === 'refusal') return reply(200, { refused: true, error: 'Claude declined that request. Try wording it differently.' });
    if (data.stop_reason === 'max_tokens') return reply(502, { error: 'The answer was cut off. Try a shorter request.', retry: true });

    const text = (data.content || []).find(block => block.type === 'text')?.text;
    try { return reply(200, { result: JSON.parse(text) }); } catch { return reply(502, { error: 'Claude answered in an unexpected format.', retry: true }); }
  },
};
