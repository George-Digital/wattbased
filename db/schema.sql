-- Watt Based launch schema foundation.
-- Mirrors the Rev B spec enough to begin Supabase migration work.

create extension if not exists pgcrypto;

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  website_url text,
  affiliate_network text,
  affiliate_join_url text,
  commission_note text,
  support_note text
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  name text not null,
  slug text not null unique,
  status text not null default 'current' check (status in ('review','announced','current','discontinued')),
  release_date date,
  msrp_usd numeric(10,2),
  hero_image text,
  summary text,
  last_verified_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists powerstation_specs (
  product_id uuid primary key references products(id) on delete cascade,
  capacity_wh int,
  tested_capacity_wh int,
  chemistry text check (chemistry in ('LiFePO4','NMC','Na-ion')),
  cycles_to_80pct int,
  expandable boolean default false,
  max_expanded_wh int,
  ac_output_w int,
  ac_surge_w int,
  ac_outlets int,
  ports jsonb,
  ac_input_w int,
  charge_0_80_min int,
  charge_0_100_min int,
  solar_input_w int,
  solar_v_min numeric(5,1),
  solar_v_max numeric(5,1),
  mppt_count int,
  has_ups boolean,
  ups_switchover_ms int,
  weight_lb numeric(6,2),
  dims_in text,
  wheels boolean,
  noise_dba int,
  wifi boolean,
  bluetooth boolean,
  app_control boolean,
  warranty_months int,
  field_meta jsonb not null default '{}'
);

create table if not exists retailers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  link_template text not null,
  network text,
  cookie_window_days int,
  history_allowed boolean default true,
  priority int default 100
);

create table if not exists offers (
  id bigint generated always as identity primary key,
  product_id uuid references products(id),
  retailer_id uuid references retailers(id),
  price numeric(10,2) not null,
  list_price numeric(10,2),
  coupon_code text,
  coupon_expires date,
  in_stock boolean default true,
  bundle_id uuid,
  feed_source text,
  url text not null,
  captured_at timestamptz not null default now()
);
create index if not exists offers_product_time on offers (product_id, captured_at desc);

create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id),
  url text not null,
  license text not null check (license in ('manufacturer_press','own_photo','licensed')),
  attribution text,
  source_url text,
  captured_at timestamptz default now()
);

create table if not exists source_documents (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id),
  kind text check (kind in ('product_page','manual_pdf','press_kit','test_report')),
  url text,
  checksum text,
  crawled_at timestamptz,
  license_note text
);

create table if not exists pipeline_runs (
  id bigint generated always as identity primary key,
  job text not null,
  status text check (status in ('ok','failed','disabled')),
  started_at timestamptz,
  finished_at timestamptz,
  rows_touched int,
  error text,
  owner_alerted boolean default false
);
