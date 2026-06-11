import { mkdir, readFile, rm, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
let observations = [];
try { observations = JSON.parse(await readFile(path.join(root, 'data/price-observations.json'), 'utf8')); } catch {}
const latestBySlug = new Map();
for (const o of observations) {
  const prev = latestBySlug.get(o.productSlug);
  if (!prev || new Date(o.capturedAt) > new Date(prev.capturedAt)) latestBySlug.set(o.productSlug, o);
}
const products = JSON.parse(await readFile(path.join(root, 'data/products.json'), 'utf8')).map(enrich);

function enrich(p){
  const latest = latestBySlug.get(p.slug);
  if (latest) {
    p.offers = p.offers?.length ? p.offers : [{retailer: latest.retailer, url: latest.url}];
    p.offers[0] = {...p.offers[0], retailer: latest.retailer, price: latest.price, url: latest.url, capturedAt: latest.capturedAt};
  }
  const low = Math.min(...p.offers.map(o => o.price));
  return {
    ...p,
    lowPrice: low,
    dollarsPerWh: low && p.capacityWh ? low / p.capacityWh : null,
    whPerLb: p.capacityWh && p.weightLb ? p.capacityWh / p.weightLb : null,
    trackingDays: Math.max(1, Math.ceil((Date.now() - new Date(p.offers[0]?.capturedAt || Date.now()).getTime()) / 86400000))
  };
}

const esc = (s='') => String(s).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money = n => n == null ? '—' : `$${Number(n).toLocaleString(undefined,{maximumFractionDigits:0})}`;
const num = n => n == null ? '—' : Number(n).toLocaleString();
const pct = n => n == null ? '—' : `${(n * 100).toFixed(1)}%`;

function page(title, description, body, extraHead=''){
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | Watt Based</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="https://wattbased.com${currentPath}"><link rel="stylesheet" href="/style.css">${extraHead}</head><body><header class="site-header"><a class="brand" href="/"><span class="bolt">▰</span> Watt Based</a><nav><a href="/power-stations/">Power stations</a><a href="/compare/">Compare</a><a href="/deals/">Deals</a><a href="/tools/runtime-calculator/">Runtime calculator</a><a href="/data-sources/">Methodology</a></nav></header><main>${body}</main><footer><strong>Watt Based</strong><span>Portable power station data, price tracking, and comparison tools.</span><a href="/disclosure/">Affiliate disclosure</a><a href="/privacy/">Privacy</a></footer><script src="/app.js" type="module"></script></body></html>`;
}

let currentPath = '/';
async function out(route, html){
  const dir = path.join(dist, route.replace(/^\//,'').replace(/\/$/,'') || '.');
  await mkdir(dir, {recursive:true});
  await writeFile(path.join(dir, 'index.html'), html);
}

function productCard(p){
  return `<article class="card"><img src="${p.image}" alt="${esc(p.brand)} ${esc(p.name)}"><div><p class="eyebrow">${esc(p.brand)}</p><h3><a href="/power-stations/${p.slug}/">${esc(p.name)}</a></h3><p>${esc(p.summary)}</p><dl class="metrics"><div><dt>Capacity</dt><dd>${num(p.capacityWh)} Wh</dd></div><div><dt>Low price</dt><dd>${money(p.lowPrice)}</dd></div><div><dt>$/Wh</dt><dd>${p.dollarsPerWh ? `$${p.dollarsPerWh.toFixed(2)}` : '—'}</dd></div><div><dt>Wh/lb</dt><dd>${p.whPerLb ? p.whPerLb.toFixed(1) : '—'}</dd></div></dl></div></article>`;
}

await rm(dist, {recursive:true, force:true});
await mkdir(dist, {recursive:true});
await cp(path.join(root, 'public'), dist, {recursive:true});
await writeFile(path.join(dist, 'products.json'), JSON.stringify(products, null, 2));

currentPath = '/';
await out('/', page('Portable Power Station Database', 'Compare portable power stations by capacity, output, price per watt-hour, weight, and price tracking maturity.', `<section class="hero"><p class="eyebrow">Public from day one · indexable · data-maturity labeled</p><h1>Portable power station specs, prices, and comparisons — built from data.</h1><p class="lede">Watt Based tracks backup batteries and solar generators with source-backed specs, live retailer links, price-history readiness labels, and practical calculators.</p><div class="actions"><a class="button" href="/power-stations/">Browse power stations</a><a class="button secondary" href="/compare/">Compare models</a></div></section><section class="strip"><div><b>${products.length}</b><span>tracked launch SKUs</span></div><div><b>${products.reduce((a,p)=>a+p.offers.length,0)}</b><span>price observations</span></div><div><b>${new Set(products.map(p=>p.brand)).size}</b><span>brands seeded</span></div><div><b>28 days</b><span>deal-score maturity target</span></div></section><section><div class="section-head"><p class="eyebrow">Best current values</p><h2>Lowest $/Wh in the seed catalog</h2></div><div class="grid">${products.slice().sort((a,b)=>a.dollarsPerWh-b.dollarsPerWh).map(productCard).join('')}</div></section>`));

currentPath = '/power-stations/';
await out('/power-stations/', page('Power Station Catalog', 'Browse Watt Based portable power station records with verified specs and current retailer links.', `<section class="page-title"><p class="eyebrow">Catalog</p><h1>Power stations</h1><p>Every product page is public and indexable from day one when it has core verified specs, a licensed image placeholder/asset, and at least one retailer/source link. Price-history modules clearly label early tracking periods.</p></section><div class="grid">${products.map(productCard).join('')}</div>`));

for (const p of products){
  currentPath = `/power-stations/${p.slug}/`;
  const jsonLd = `<script type="application/ld+json">${JSON.stringify({"@context":"https://schema.org","@type":"Product",name:`${p.brand} ${p.name}`,brand:{"@type":"Brand",name:p.brand},description:p.summary,image:`https://wattbased.com${p.image}`,offers:{"@type":"Offer",priceCurrency:"USD",price:p.lowPrice,availability:"https://schema.org/InStock",url:`https://wattbased.com/go/${p.offers[0].retailer.toLowerCase().replace(/[^a-z0-9]+/g,'-')}/${p.slug}/`}}, null, 0)}</script>`;
  await out(`/power-stations/${p.slug}/`, page(`${p.brand} ${p.name}`, `${p.brand} ${p.name} specs, price tracking, current offer, and comparison metrics.`, `<article class="product"><div><p class="eyebrow">${esc(p.brand)}</p><h1>${esc(p.name)}</h1><p class="lede">${esc(p.summary)}</p><p class="notice">Price tracking began ${esc(p.lastVerified)}. Deal scores become more reliable after 28 days of observations.</p><div class="actions"><a class="button" rel="sponsored noopener" href="/go/${p.offers[0].retailer.toLowerCase().replace(/[^a-z0-9]+/g,'-')}/${p.slug}/">Check current price</a><a class="button secondary" href="/compare/?a=${p.slug}">Compare this model</a></div></div><img src="${p.image}" alt="${esc(p.brand)} ${esc(p.name)}"></article><section class="spec-grid"><div><h2>Core specs</h2><table><tr><th>Capacity</th><td>${num(p.capacityWh)} Wh</td></tr><tr><th>Chemistry</th><td>${esc(p.chemistry)}</td></tr><tr><th>AC output</th><td>${num(p.acOutputW)} W</td></tr><tr><th>Solar input</th><td>${num(p.solarInputW)} W</td></tr><tr><th>Weight</th><td>${num(p.weightLb)} lb</td></tr><tr><th>MSRP</th><td>${money(p.msrp)}</td></tr></table></div><div><h2>Computed metrics</h2><table><tr><th>Current low</th><td>${money(p.lowPrice)}</td></tr><tr><th>Dollars per Wh</th><td>${p.dollarsPerWh ? `$${p.dollarsPerWh.toFixed(2)}` : '—'}</td></tr><tr><th>Wh per lb</th><td>${p.whPerLb ? p.whPerLb.toFixed(1) : '—'}</td></tr><tr><th>Tracking maturity</th><td>${p.trackingDays} / 28 days</td></tr></table></div></section><section><h2>Source and safety notes</h2><p>Specs are tracked from manufacturer pages or manuals and should be verified against the manufacturer before purchase or critical backup use.</p><p><a href="${esc(p.sourceUrl)}" rel="noopener">Manufacturer/source page</a></p></section>`, jsonLd));

  currentPath = `/go/${p.offers[0].retailer.toLowerCase().replace(/[^a-z0-9]+/g,'-')}/${p.slug}/`;
  await out(currentPath, page(`Leaving for ${p.offers[0].retailer}`, `Affiliate redirect disclosure for ${p.brand} ${p.name}.`, `<section class="page-title"><p class="eyebrow">Affiliate link</p><h1>You're heading to ${esc(p.offers[0].retailer)}</h1><p>Watt Based may earn a commission from qualifying purchases. This never changes our specs, rankings, or deal calculations.</p><p><a class="button" href="${esc(p.offers[0].url)}" rel="sponsored noopener">Continue to retailer</a></p></section>`));
}

currentPath = '/deals/';
await out('/deals/', page('Power Station Deals', 'Current portable power station prices ranked by dollars per watt-hour and tracking maturity.', `<section class="page-title"><p class="eyebrow">Deals</p><h1>Current power station deals</h1><p class="notice">Early tracking period: deal scores are labeled until each model has 28 days of price observations.</p></section><table class="wide"><tr><th>Model</th><th>Current low</th><th>$/Wh</th><th>Tracking</th></tr>${products.slice().sort((a,b)=>a.dollarsPerWh-b.dollarsPerWh).map(p=>`<tr><td><a href="/power-stations/${p.slug}/">${esc(p.brand)} ${esc(p.name)}</a></td><td>${money(p.lowPrice)}</td><td>$${p.dollarsPerWh.toFixed(2)}</td><td>${p.trackingDays}/28 days</td></tr>`).join('')}</table>`));

currentPath = '/compare/';
await out('/compare/', page('Compare Power Stations', 'Compare portable power stations by capacity, output, chemistry, weight, and price per watt-hour.', `<section class="page-title"><p class="eyebrow">Comparison tool</p><h1>Compare power stations</h1><p>Select two models. The comparison runs from the same public product dataset used by the catalog.</p></section><div id="compare-app" class="tool"></div>`));

currentPath = '/tools/runtime-calculator/';
await out('/tools/runtime-calculator/', page('Runtime Calculator', 'Estimate portable power station runtime for common loads using capacity, inverter loss, and duty cycle.', `<section class="page-title"><p class="eyebrow">Tool</p><h1>Runtime calculator</h1><p>Estimate runtime with a conservative 85% usable-capacity assumption. Informational only — verify critical, medical, or safety loads with the device manufacturer.</p></section><form class="tool" id="runtime-form"><label>Battery capacity (Wh)<input name="capacity" type="number" value="1024"></label><label>Load (watts)<input name="watts" type="number" value="100"></label><label>Duty cycle (%)<input name="duty" type="number" value="100"></label><button class="button" type="submit">Calculate</button><output id="runtime-output"></output></form>`));

for (const [route,title,body] of [
  ['/data-sources/','Data Sources & Methodology',`<p>Watt Based uses manufacturer pages, manuals, licensed/press images, sanctioned affiliate feeds, and attributed third-party test data. Every spec should trace back to a source before scale publication.</p><p>Prices display an as-of timestamp. Price history is retained only for sources whose terms permit retention.</p>`],
  ['/disclosure/','Affiliate Disclosure',`<p>Watt Based may earn commissions when readers click retailer links. Affiliate relationships do not affect specs, rankings, leaderboards, or deal calculations.</p>`],
  ['/privacy/','Privacy Policy',`<p>Watt Based is designed to collect the minimum data needed for alerts and analytics. Price-alert emails require confirmation and include one-click unsubscribe.</p>`],
  ['/about/','About Watt Based',`<p>Watt Based is a database-first guide to portable power stations, backup batteries, and solar-generator setups. The mission is to make specs and prices easier to compare.</p>`]
]){
  currentPath = route;
  await out(route, page(title, `${title} for Watt Based.`, `<section class="page-title"><p class="eyebrow">Trust</p><h1>${title}</h1>${body}</section>`));
}

await writeFile(path.join(dist, 'style.css'), `:root{--paper:#fafbf9;--panel:#f1f4f0;--ink:#1a2421;--dim:#5c6b64;--teal:#0e8074;--line:#d8ded9;--amber:#b26a05}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.62 system-ui,-apple-system,Segoe UI,sans-serif}.site-header,footer{display:flex;gap:22px;align-items:center;justify-content:space-between;padding:22px clamp(18px,4vw,54px);border-bottom:1px solid var(--line)}footer{border-top:2px solid var(--ink);border-bottom:0;margin-top:70px;flex-wrap:wrap;color:var(--dim)}nav{display:flex;gap:14px;flex-wrap:wrap}.brand{font-weight:900;font-size:22px;color:var(--ink);text-decoration:none}.bolt{color:var(--teal)}a{color:var(--teal)}main{max-width:1120px;margin:auto;padding:44px 24px 80px}.hero{padding:54px 0 36px;border-bottom:2px solid var(--ink)}h1{font-size:clamp(38px,7vw,72px);line-height:1.02;letter-spacing:-.045em;margin:.1em 0}h2{font-size:clamp(24px,3vw,34px);letter-spacing:-.025em}.lede{font-size:20px;color:var(--dim);max-width:760px}.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:800;color:var(--teal)}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.button{display:inline-block;background:var(--teal);color:white;text-decoration:none;border:0;border-radius:6px;padding:12px 17px;font-weight:800;cursor:pointer}.button.secondary{background:var(--ink)}.strip{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:28px 0}.strip div,.card,.tool,.notice{background:var(--panel);padding:18px;border:1px solid var(--line);border-radius:12px}.strip b{font-size:28px;display:block}.strip span{color:var(--dim)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}.card{display:grid;grid-template-columns:110px 1fr;gap:16px}.card img,.product img{width:100%;border-radius:10px;background:white}.card h3{margin:.1em 0}.metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:14px 0 0}.metrics div{border-top:1px solid var(--line);padding-top:7px}.metrics dt{font-size:12px;color:var(--dim)}.metrics dd{margin:0;font-weight:800}.page-title{max-width:820px;margin-bottom:30px}.product{display:grid;grid-template-columns:1.2fr .8fr;gap:30px;align-items:center}.spec-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:24px;margin-top:38px}table{width:100%;border-collapse:collapse;background:white}th,td{text-align:left;border-bottom:1px solid var(--line);padding:10px}.wide th{background:var(--ink);color:white}label{display:grid;gap:5px;margin:12px 0}input,select{font:inherit;padding:10px;border:1px solid var(--line);border-radius:6px}output{display:block;margin-top:16px;font-size:24px;font-weight:900}@media(max-width:760px){.site-header,.product,.spec-grid{display:block}.strip{grid-template-columns:repeat(2,1fr)}nav{margin-top:12px}.card{grid-template-columns:1fr}}`);

await writeFile(path.join(dist, 'app.js'), `const $=s=>document.querySelector(s);async function data(){return fetch('/products.json').then(r=>r.json())}if($('#runtime-form')){$('#runtime-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);const h=(+f.get('capacity')*.85)/(+f.get('watts')*(+f.get('duty')/100));$('#runtime-output').textContent=isFinite(h)?h.toFixed(1)+' estimated hours':'Enter valid numbers';});}if($('#compare-app')){data().then(ps=>{const opts=ps.map(p=>'<option value="'+p.slug+'">'+p.brand+' '+p.name+'</option>').join('');$('#compare-app').innerHTML='<label>Model A<select id="a">'+opts+'</select></label><label>Model B<select id="b">'+opts+'</select></label><div id="cmp"></div>';const draw=()=>{const a=ps.find(p=>p.slug==$('#a').value),b=ps.find(p=>p.slug==$('#b').value);$('#cmp').innerHTML='<table><tr><th>Metric</th><th>'+a.brand+' '+a.name+'</th><th>'+b.brand+' '+b.name+'</th></tr>'+['capacityWh','chemistry','acOutputW','solarInputW','weightLb','lowPrice'].map(k=>'<tr><td>'+k+'</td><td>'+a[k]+'</td><td>'+b[k]+'</td></tr>').join('')+'</table>';};$('#b').selectedIndex=Math.min(1,ps.length-1);$('#a').onchange=$('#b').onchange=draw;draw();});}`);

await writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: https://wattbased.com/sitemap.xml\n`);
await writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/','/power-stations/','/compare/','/deals/','/tools/runtime-calculator/','/data-sources/','/disclosure/','/privacy/','/about/',...products.map(p=>`/power-stations/${p.slug}/`)].map(u=>`<url><loc>https://wattbased.com${u}</loc></url>`).join('')}</urlset>`);
console.log(`Built Watt Based static site: ${products.length} products -> ${dist}`);
