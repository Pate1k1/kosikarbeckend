-- schema.sql
-- Skopíruj celý tento súbor do Supabase -> SQL Editor -> spusti (Run).
-- Vytvorí tabuľku "coupons", kde budú žiť všetky kódy pre všetky e-shopy.

create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  shop_id text not null,          -- napr. "alza.sk"
  category text,                  -- napr. "electronics", null = platí na všetko
  min_amount numeric default 0,   -- minimálna suma košíka, aby kód platil
  success_count int default 0,    -- koľkokrát reálne sadol
  fail_count int default 0,       -- koľkokrát zlyhal
  is_active boolean default true, -- keď fail_count je príliš vysoký, nastavíš na false
  last_verified_at timestamptz,   -- kedy naposledy reálne sadol niekomu
  created_at timestamptz default now()
);

-- rýchle vyhľadávanie podľa e-shopu (to sa bude pýtať najčastejšie)
create index if not exists idx_coupons_shop_id on coupons (shop_id);

-- Tvoj prvý reálny, overený kód - rovnaký, ktorý si práve testoval
insert into coupons (code, shop_id, category, min_amount, success_count, last_verified_at)
values ('ALZADNI30', 'alza.sk', null, 0, 1, now());
