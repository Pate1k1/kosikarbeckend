# Backend - Overené Zľavy

## 1. Supabase (databáza)
1. Idi na supabase.com, vytvor nový projekt (zadarmo)
2. V ľavom menu klikni na "SQL Editor"
3. Skopíruj celý obsah `schema.sql` a klikni "Run"
4. V "Project Settings" -> "API" skopíruj:
   - `Project URL` -> vlož do `.env` ako `SUPABASE_URL`
   - `service_role` key (nie "anon" key!) -> vlož ako `SUPABASE_SERVICE_KEY`

## 2. Lokálne testovanie (predtým než dáš na Railway)
```bash
cp .env.example .env
# uprav .env, doplň reálne hodnoty
npm install
npm start
```

Over v prehliadači: `http://localhost:3000/api/coupons?shop=alza.sk`
Mal by vrátiť: `{"coupons":[{"code":"ALZADNI30","category":null,"min_amount":0}]}`

## 3. Railway (nasadenie online)
1. Idi na railway.app, "New Project" -> "Deploy from GitHub repo"
2. Vyber tento repozitár (backend priečinok)
3. V "Variables" pridaj `SUPABASE_URL` a `SUPABASE_SERVICE_KEY` (rovnaké ako v `.env`)
4. Railway ti po nasadení dá verejnú URL, napr. `https://tvoj-projekt.up.railway.app`
5. Over: `https://tvoj-projekt.up.railway.app/api/coupons?shop=alza.sk`

Túto URL potom použiješ v extension namiesto `MOCK_COUPONS`.
