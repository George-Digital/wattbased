# Watt Based

Static-first launch build for **wattbased.com**.

## Current state

- Public/indexable pages from day one.
- No temporary sitewide `noindex` dependency.
- Product pages label early price-history maturity instead of blocking publication.
- Seed catalog lives in `data/products.json`.
- Build output goes to `dist/`.

## Commands

```bash
npm run check
npm run build
```

## Routes generated

- `/`
- `/power-stations/`
- `/power-stations/[slug]/`
- `/compare/`
- `/deals/`
- `/tools/runtime-calculator/`
- `/data-sources/`
- `/disclosure/`
- `/privacy/`
- `/about/`
- `/go/[retailer]/[product]/` disclosure/redirect interstitial pages for static launch

## Next build steps

1. Expand `data/products.json` toward the 150-product launch catalog.
2. Replace placeholder image with licensed manufacturer/own-photo assets per product.
3. Wire real `/go/` logging when the dynamic/Worker layer is added.
4. Add daily price import job and append observations.
5. Promote `db/schema.sql` into Supabase when credentials are ready.
