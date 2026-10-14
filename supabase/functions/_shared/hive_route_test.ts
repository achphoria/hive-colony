// deno test -A supabase/functions/_shared/hive_route_test.ts
import { GROK_AGENTS, grokCredentials, routeAgent, teamBlock, type Agent } from './hive.ts';

function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}: ${a} !== ${b}`);
}

const envOf = (pairs: Record<string, string | undefined>) => (name: string) => pairs[name];

Deno.test('Pixel dan Spark ke Grok Bot hanya kalau URL dan kunci ada', () => {
  eq(GROK_AGENTS.includes('visual') && GROK_AGENTS.includes('ads'), true, 'daftar');
  const both = envOf({
    GROKBOT_URL_VISUAL: ' https://bot.example/visual ',
    GROKBOT_KEY_VISUAL: 'key-visual',
    GROKBOT_URL_ADS: 'https://bot.example/ads',
    GROKBOT_KEY_ADS: 'key-ads',
  });
  eq(grokCredentials('visual', both), { url: 'https://bot.example/visual', token: 'key-visual' }, 'visual');
  eq(grokCredentials('ads', both)?.url, 'https://bot.example/ads', 'ads url');
  eq(routeAgent('visual', { configured: !!grokCredentials('visual', both) }), 'grok', 'visual route');
  eq(routeAgent('ads', { configured: !!grokCredentials('ads', both) }), 'grok', 'ads route');

  const noKey = envOf({ GROKBOT_URL_ADS: 'https://bot.example/ads', GROKBOT_KEY_ADS: '   ' });
  eq(grokCredentials('ads', noKey), null, 'kunci kosong');
  eq(routeAgent('ads', { configured: !!grokCredentials('ads', noKey) }), 'claude', 'ads tanpa secret');

  const noUrl = envOf({ GROKBOT_KEY_VISUAL: 'key-visual' });
  eq(grokCredentials('visual', noUrl), null, 'url kosong');
  eq(routeAgent('visual', { configured: false }), 'claude', 'visual fallback');
});

Deno.test('agent lain tetap n8n; Queen Grok adalah pilihan eksplisit', () => {
  eq(routeAgent('analyst', { configured: true }), 'claude', 'analyst');
  eq(routeAgent('cloud', { configured: false }), 'claude', 'cloud tanpa secret');
  eq(routeAgent('cloud', { configured: true }), 'grok', 'cloud dengan secret');
  eq(routeAgent('ceo', { engine: 'grokbot', configured: false }), 'grok', 'queen grok');
  eq(routeAgent('ceo', { engine: 'claude', configured: true }), 'claude', 'queen claude');
  eq(routeAgent('ceo', { configured: true }), 'claude', 'queen default');
});

Deno.test('teamBlock menandai Grok Bot hanya untuk agent yang secretnya lengkap', () => {
  const keys = ['GROKBOT_URL_VISUAL', 'GROKBOT_KEY_VISUAL', 'GROKBOT_URL_ADS', 'GROKBOT_KEY_ADS', 'GROKBOT_URL_CLOUD', 'GROKBOT_KEY_CLOUD'];
  const prev = Object.fromEntries(keys.map((k) => [k, Deno.env.get(k)]));
  const agents: Agent[] = [
    { agent_id: 'visual', nick: 'Pixel', dept: 'mkt', system_prompt: 'Kamu adalah Pixel. Desainer visual.' },
    { agent_id: 'ads', nick: 'Spark', dept: 'mkt', system_prompt: 'Kamu adalah Spark. Strategi iklan.' },
    { agent_id: 'analyst', nick: 'Graph', dept: 'fin', system_prompt: 'Kamu adalah Graph. Analis data.' },
  ];
  try {
    Deno.env.set('GROKBOT_URL_VISUAL', 'https://bot.example/visual');
    Deno.env.set('GROKBOT_KEY_VISUAL', 'key-visual');
    Deno.env.delete('GROKBOT_URL_ADS');
    Deno.env.delete('GROKBOT_KEY_ADS');
    const block = teamBlock(agents);
    if (!block.includes('visual · Pixel · mkt · Desainer visual. · (Grok Bot)')) throw new Error(`Pixel tidak ditandai Grok:\n${block}`);
    if (block.includes('Spark') && block.split('\n').find((l) => l.includes('ads · Spark'))?.includes('(Grok Bot)')) {
      throw new Error(`Spark tanpa secret tidak boleh ditandai Grok:\n${block}`);
    }
    if (block.split('\n').find((l) => l.includes('analyst'))?.includes('(Grok Bot)')) throw new Error(`Graph bukan Grok:\n${block}`);
  } finally {
    for (const k of keys) {
      const old = prev[k];
      if (old == null) Deno.env.delete(k);
      else Deno.env.set(k, old);
    }
  }
});
