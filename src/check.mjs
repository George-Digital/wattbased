import { readFile } from 'node:fs/promises';
const products = JSON.parse(await readFile(new URL('../data/products.json', import.meta.url), 'utf8'));
const required = ['brand','name','slug','capacityWh','chemistry','acOutputW','solarInputW','weightLb','image','sourceUrl','lastVerified'];
let errors = 0;
for (const p of products) {
  for (const key of required) {
    if (p[key] === undefined || p[key] === null || p[key] === '') {
      console.error(`Missing ${key}: ${p.slug || p.name || '(unknown)'}`);
      errors++;
    }
  }
  if (!Array.isArray(p.offers) || p.offers.length < 1) {
    console.error(`Missing offer: ${p.slug}`);
    errors++;
  }
}
const slugs = new Set();
for (const p of products) {
  if (slugs.has(p.slug)) { console.error(`Duplicate slug: ${p.slug}`); errors++; }
  slugs.add(p.slug);
}
if (errors) process.exit(1);
console.log(`Check passed: ${products.length} products have required launch fields.`);
