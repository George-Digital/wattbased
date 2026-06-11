import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productsPath = path.join(root, 'data/products.json');
const observationsPath = path.join(root, 'data/price-observations.json');
const USER_AGENT = process.env.WATTBASED_USER_AGENT || 'WattBasedBot/0.1 (+https://wattbased.com/data-sources/; contact: ops@wattbased.com)';
const UPDATE_PRODUCTS = process.argv.includes('--update-products');
const LIMIT = Number(process.env.LIMIT || process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || 0);
const MIN_DELAY_MS = Number(process.env.CRAWL_DELAY_MS || 2500);

const products = JSON.parse(await readFile(productsPath, 'utf8'));
let observations = [];
try { observations = JSON.parse(await readFile(observationsPath, 'utf8')); } catch {}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const money = s => {
  if (s == null) return null;
  const n = Number(String(s).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

async function allowedByRobots(url) {
  const u = new URL(url);
  const robotsUrl = `${u.protocol}//${u.host}/robots.txt`;
  try {
    const res = await fetch(robotsUrl, {headers: {'user-agent': USER_AGENT}, signal: AbortSignal.timeout(10000)});
    if (!res.ok) return {allowed: true, note: `robots ${res.status}`};
    const text = await res.text();
    const groups = parseRobots(text);
    const pathWithQuery = `${u.pathname}${u.search}`;
    const verdict = robotsAllows(groups, USER_AGENT, pathWithQuery);
    return {allowed: verdict.allowed, note: verdict.note || 'robots checked'};
  } catch (error) {
    return {allowed: true, note: `robots fetch failed: ${error.message}`};
  }
}

function parseRobots(text) {
  const groups = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line || !line.includes(':')) continue;
    const [k, ...rest] = line.split(':');
    const key = k.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      if (!current || current.rules.length) {
        current = {agents: [], rules: []};
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((key === 'allow' || key === 'disallow') && current) {
      current.rules.push({type: key, path: value});
    }
  }
  return groups;
}

function robotsAllows(groups, ua, pathname) {
  const agent = ua.toLowerCase();
  const matching = groups.filter(g => g.agents.some(a => a === '*' || agent.includes(a.replace('*',''))));
  const rules = matching.flatMap(g => g.rules).filter(r => r.path !== '');
  let best = null;
  for (const r of rules) {
    if (robotsRuleMatches(r.path, pathname) && (!best || r.path.length > best.path.length)) best = r;
  }
  if (!best) return {allowed: true};
  return {allowed: best.type === 'allow', note: `${best.type}: ${best.path}`};
}

function robotsRuleMatches(rule, pathname) {
  const escaped = rule
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\$$/, '$');
  return new RegExp(`^${escaped}`).test(pathname);
}

function extractJsonLdPrices(html) {
  const prices = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim().replace(/^<!--|-->$/g, '');
    try { walkJson(JSON.parse(raw), prices); } catch {}
  }
  return prices;
}

function walkJson(node, prices) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach(n => walkJson(n, prices));
  if (node.offers) walkJson(node.offers, prices);
  if (node['@graph']) walkJson(node['@graph'], prices);
  if (node.price || node.lowPrice || node.highPrice) {
    const p = money(node.price ?? node.lowPrice ?? node.highPrice);
    if (p) prices.push({price: p, method: 'json-ld'});
  }
  for (const v of Object.values(node)) if (v && typeof v === 'object') walkJson(v, prices);
}

function extractPrice(html) {
  const candidates = [];
  candidates.push(...extractJsonLdPrices(html));
  const patterns = [
    /<meta[^>]+(?:property|name)=["']product:price:amount["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']product:price:amount["'][^>]*>/i,
    /itemprop=["']price["'][^>]+content=["']([^"']+)["']/i,
    /["']price["']\s*:\s*["']?([0-9][0-9,.]*)/i,
    /["']salePrice["']\s*:\s*["']?([0-9][0-9,.]*)/i
  ];
  for (const pattern of patterns) {
    const m = html.match(pattern);
    const p = m && money(m[1]);
    if (p) candidates.push({price: p, method: 'html-pattern'});
  }
  const sensible = candidates.filter(c => c.price >= 50 && c.price <= 10000);
  sensible.sort((a,b) => a.price - b.price);
  return sensible[0] || null;
}

const runId = new Date().toISOString();
let touched = 0;
let found = 0;
let skipped = 0;
const selected = LIMIT ? products.slice(0, LIMIT) : products;

for (const product of selected) {
  const url = product.offers?.[0]?.url || product.sourceUrl;
  if (!url) continue;
  const retailer = product.offers?.[0]?.retailer || product.brand;
  const robots = await allowedByRobots(url);
  if (!robots.allowed) {
    console.log(`SKIP robots disallow ${product.slug}: ${robots.note}`);
    skipped++;
    continue;
  }
  await sleep(MIN_DELAY_MS);
  touched++;
  try {
    const res = await fetch(url, {headers: {'user-agent': USER_AGENT, 'accept': 'text/html,application/xhtml+xml'}, signal: AbortSignal.timeout(20000)});
    const html = await res.text();
    const extracted = res.ok ? extractPrice(html) : null;
    if (!extracted) {
      console.log(`MISS ${product.slug}: HTTP ${res.status}`);
      continue;
    }
    found++;
    const observation = {
      productSlug: product.slug,
      retailer,
      price: extracted.price,
      currency: 'USD',
      url,
      capturedAt: runId,
      method: extracted.method,
      source: 'public-product-page',
      robots: robots.note
    };
    observations.push(observation);
    if (UPDATE_PRODUCTS) {
      product.offers = product.offers || [];
      product.offers[0] = {...(product.offers[0] || {}), retailer, price: extracted.price, url, capturedAt: runId};
    }
    console.log(`OK ${product.slug}: $${extracted.price} (${extracted.method})`);
  } catch (error) {
    console.log(`ERR ${product.slug}: ${error.message}`);
  }
}

await writeFile(observationsPath, JSON.stringify(observations.slice(-5000), null, 2) + '\n');
if (UPDATE_PRODUCTS) await writeFile(productsPath, JSON.stringify(products, null, 2) + '\n');

console.log(`Price scrape complete: checked=${touched}, found=${found}, skipped=${skipped}, observations=${observations.length}`);
