import { toBasePageUrl } from '@/utils/externalUrlResource';

export interface UrlClusterRule {
  id: string;
  domain: string;
  pathRegex: string;
  clusterKeyFormat: string;
  variantGroup?: number | null;
  priority: number;
  enabled: boolean;
  builtIn: boolean;
  description?: string;
}

export interface ClusterMatch {
  clusterKey: string;
  variantHint?: string | null;
}

export const BUILTIN_URL_CLUSTER_RULES: UrlClusterRule[] = [
  {
    id: 'ucr-github',
    domain: 'github.com',
    pathRegex: '^/([^/]+)/([^/]+)(?:/.*)?$',
    clusterKeyFormat: 'github.com|{1}|{2}',
    variantGroup: null,
    priority: 100,
    enabled: true,
    builtIn: true,
    description: 'GitHub 仓库路径',
  },
  {
    id: 'ucr-gitlab',
    domain: 'gitlab.com',
    pathRegex: '^/([^/]+)/([^/]+)(?:/.*)?$',
    clusterKeyFormat: 'gitlab.com|{1}|{2}',
    variantGroup: null,
    priority: 90,
    enabled: true,
    builtIn: true,
    description: 'GitLab 项目路径',
  },
  {
    id: 'ucr-numeric-id',
    domain: '*',
    pathRegex: '^/(?:[^/]+/)*([0-9]{4,})(?:/([^/]+))?/?$',
    clusterKeyFormat: '{domain}|id|{1}',
    variantGroup: 2,
    priority: 10,
    enabled: true,
    builtIn: true,
    description: '路径中含 4 位以上数字 ID 的通用规则',
  },
];

function normalizeHost(host: string | null): string | null {
  if (!host) return null;
  let normalized = host.trim().toLowerCase();
  if (normalized.startsWith('www.')) {
    normalized = normalized.slice(4);
  }
  return normalized;
}

function matchesDomain(rule: UrlClusterRule, host: string): boolean {
  const ruleDomain = normalizeHost(rule.domain);
  if (!ruleDomain || ruleDomain === '*') return true;
  return host === ruleDomain || host.endsWith(`.${ruleDomain}`);
}

function formatClusterKey(format: string, host: string, matcher: RegExpMatchArray): string {
  let result = format.replace('{domain}', host);
  for (let group = 1; group < matcher.length; group += 1) {
    result = result.replace(`{${group}}`, matcher[group] ?? '');
  }
  return result.trim();
}

export function matchUrlCluster(url: string, rules: UrlClusterRule[] = BUILTIN_URL_CLUSTER_RULES): ClusterMatch | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const host = normalizeHost(parsed.hostname);
  if (!host) return null;

  const base = toBasePageUrl(parsed);
  let path = '/';
  try {
    path = new URL(base).pathname.replace(/\/+$/, '') || '/';
  } catch {
    path = parsed.pathname.replace(/\/+$/, '') || '/';
  }

  const candidates = rules
    .filter((rule) => rule.enabled && matchesDomain(rule, host))
    .sort((a, b) => b.priority - a.priority || b.pathRegex.length - a.pathRegex.length);

  for (const rule of candidates) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(rule.pathRegex);
    } catch {
      continue;
    }
    const matcher = pattern.exec(path);
    if (!matcher) continue;

    const clusterKey = formatClusterKey(rule.clusterKeyFormat, host, matcher);
    if (!clusterKey) continue;

    let variantHint: string | null = null;
    if (rule.variantGroup && rule.variantGroup > 0) {
      variantHint = matcher[rule.variantGroup]?.trim() || null;
    }
    return { clusterKey, variantHint };
  }

  return null;
}

export function findWorkByClusterKey(
  works: Array<{ id: string; typeId: string; clusterKey?: string | null }>,
  typeId: string,
  clusterKey: string,
): { id: string } | null {
  const found = works.find((work) => work.typeId === typeId && work.clusterKey === clusterKey);
  return found ? { id: found.id } : null;
}
