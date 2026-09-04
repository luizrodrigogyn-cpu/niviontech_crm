import { auth } from '@clerk/nextjs/server';
import { buildProspectingQueries } from '../../../../modules/prospecting.js';
import { getD1 } from '../../../../db';
import { resolveMembership, response } from '../../../../db/org';

export const dynamic = 'force-dynamic';

type ProspectProfile = {
  segment: string;
  products: string;
  keywords: string;
  signals: string;
  exclusions: string;
  region: string;
};

type SearchResult = { title?: string; url?: string; content?: string; score?: number };
type UsageRow = { used: number; cap: number };

const allowedQuantities = new Set([25, 50, 100]);

function cleanProfile(value: unknown): ProspectProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const profile = {
    segment: String(raw.segment ?? '').trim(),
    products: String(raw.products ?? '').trim(),
    keywords: String(raw.keywords ?? '').trim(),
    signals: String(raw.signals ?? '').trim(),
    exclusions: String(raw.exclusions ?? '').trim(),
    region: String(raw.region ?? '').trim(),
  };
  if (profile.segment.length < 3 || profile.segment.length > 180) return null;
  if (profile.keywords.length < 3 || profile.keywords.length > 900) return null;
  if (profile.region.length < 2 || profile.region.length > 100) return null;
  if ([profile.products, profile.signals, profile.exclusions].some((item) => item.length > 1200)) return null;
  return profile;
}

function configuredCap() {
  const value = Number(process.env.PROSPECT_MONTHLY_QUERY_CAP ?? 100);
  return Number.isFinite(value) ? Math.max(1, Math.min(1000, Math.floor(value))) : 100;
}

async function reserveQueries(orgId: string, requested: number) {
  const db = getD1();
  const period = new Date().toISOString().slice(0, 7);
  const id = `${orgId}:${period}`;
  const cap = configuredCap();
  const updatedAt = new Date().toISOString();
  await db.prepare(`CREATE TABLE IF NOT EXISTS crm_prospect_usage (
    id TEXT PRIMARY KEY NOT NULL,
    org_id TEXT NOT NULL,
    period TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    cap INTEGER NOT NULL DEFAULT 100,
    updated_at TEXT NOT NULL
  )`).run();
  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS crm_prospect_usage_org_period_idx ON crm_prospect_usage (org_id, period)').run();
  await db.prepare('INSERT OR IGNORE INTO crm_prospect_usage (id, org_id, period, used, cap, updated_at) VALUES (?, ?, ?, 0, ?, ?)')
    .bind(id, orgId, period, cap, updatedAt).run();
  await db.prepare('UPDATE crm_prospect_usage SET cap = ? WHERE id = ?').bind(cap, id).run();
  const reservation = await db.prepare('UPDATE crm_prospect_usage SET used = used + ?, updated_at = ? WHERE id = ? AND used + ? <= cap')
    .bind(requested, updatedAt, id, requested).run();
  const usage = await db.prepare('SELECT used, cap FROM crm_prospect_usage WHERE id = ?').bind(id).first<UsageRow>();
  return {
    accepted: Number(reservation.meta.changes ?? 0) > 0,
    period,
    used: Number(usage?.used ?? 0),
    cap: Number(usage?.cap ?? cap),
    remaining: Math.max(0, Number(usage?.cap ?? cap) - Number(usage?.used ?? 0)),
  };
}

export async function GET() {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return response({ error: 'authentication_required' }, 401);
  const { orgId } = await resolveMembership(userId);
  const db = getD1();
  const period = new Date().toISOString().slice(0, 7);
  const id = `${orgId}:${period}`;
  const usage = await db.prepare('SELECT used, cap FROM crm_prospect_usage WHERE id = ?').bind(id).first<UsageRow>().catch(() => null);
  const cap = Number(usage?.cap ?? configuredCap());
  const used = Number(usage?.used ?? 0);
  return response({
    configured: Boolean(process.env.TAVILY_API_KEY?.trim()),
    usage: { period, used, cap, remaining: Math.max(0, cap - used) },
    automaticSending: false,
    paidFallback: false,
  });
}

export async function POST(request: Request) {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return response({ error: 'authentication_required' }, 401);
  const { orgId } = await resolveMembership(userId);

  let body: { quantity?: number; profile?: unknown };
  try { body = await request.json(); }
  catch { return response({ error: 'invalid_json' }, 400); }

  const quantity = Number(body.quantity);
  const profile = cleanProfile(body.profile);
  if (!allowedQuantities.has(quantity) || !profile) return response({ error: 'invalid_search' }, 400);

  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) return response({
    error: 'search_not_configured',
    message: 'A busca automática ainda não foi ativada no CRM.',
    configurationRequired: true,
    automaticSending: false,
  }, 503);

  const queries = buildProspectingQueries(profile as any).slice(0, 6);
  if (!queries.length) return response({ error: 'no_search_queries' }, 400);
  const usage = await reserveQueries(orgId, queries.length);
  if (!usage.accepted) return response({
    error: 'zero_cost_limit_reached',
    message: 'O limite mensal de proteção zero-cost foi atingido. Nenhuma consulta paga foi executada.',
    usage,
    automaticSending: false,
    paidFallback: false,
  }, 429);

  const perQuery = Math.min(20, Math.max(5, Math.ceil(quantity / queries.length) + 3));
  const searches = await Promise.allSettled(queries.map(async (query: string) => {
    const result = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        topic: 'general',
        country: 'brazil',
        language: 'pt',
        max_results: perQuery,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        safe_search: true,
      }),
    });
    if (!result.ok) throw new Error(`provider_${result.status}`);
    return await result.json() as { results?: SearchResult[] };
  }));

  const successful = searches.filter((item): item is PromiseFulfilledResult<{ results?: SearchResult[] }> => item.status === 'fulfilled');
  if (!successful.length) return response({
    error: 'search_provider_unavailable',
    message: 'A fonte pública não respondeu. Tente novamente mais tarde.',
    usage,
    automaticSending: false,
  }, 502);

  const results = successful.flatMap((item) => item.value.results ?? []).slice(0, quantity * 2).map((item) => ({
    title: String(item.title ?? '').slice(0, 240),
    url: String(item.url ?? '').slice(0, 1200),
    content: String(item.content ?? '').slice(0, 1200),
    score: Number.isFinite(Number(item.score)) ? Number(item.score) : null,
  }));
  return response({
    searchId: crypto.randomUUID(),
    results,
    queriesExecuted: queries.length,
    partial: successful.length < searches.length,
    usage,
    sourcePolicy: 'public_zero_cost',
    automaticSending: false,
    paidFallback: false,
  });
}
