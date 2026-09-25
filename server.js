// server.js
// -----------------------------------------------------------------------
// Jednoduché API s dvoma endpointami:
//
// GET  /api/coupons?shop=alza.sk
//      -> vráti zoznam aktívnych kupónov pre daný e-shop
//
// POST /api/coupon-result
//      -> extension sem posiela, či kód sadol alebo nesadol,
//         aby sa success_count/fail_count v databáze aktualizoval
//         a nefunkčné kódy sa časom automaticky deaktivovali
// -----------------------------------------------------------------------

import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

console.log("DEBUG env check:", {
  hasUrl: !!process.env.SUPABASE_URL,
  hasKey: !!process.env.SUPABASE_SERVICE_KEY,
  urlValue: process.env.SUPABASE_URL || "CHÝBA"
});

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Po koľkých zlyhaniach za sebou sa kód automaticky vypne
const FAIL_THRESHOLD = 5;

const DOGNET_EMAIL = process.env.DOGNET_EMAIL;
const DOGNET_PASSWORD = process.env.DOGNET_PASSWORD;

async function dognetLogin() {
  const res = await fetch("https://api.app.dognet.com/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: DOGNET_EMAIL, password: DOGNET_PASSWORD })
  });

  if (!res.ok) {
    throw new Error(`Dognet login zlyhal: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const token = data.token || data.access_token || data.data?.token;

  if (!token) {
    throw new Error("Token sa nenašiel v odpovedi: " + JSON.stringify(data));
  }

  return token;
}

async function fetchDognetCoupons(token) {
  const res = await fetch("https://api.app.dognet.com/api/v1/coupons/filter", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      from_joined_campaigns: true,
      filter: [{ validity: { eq: "present" } }],
      expand: "campaign"
    })
  });

  if (!res.ok) {
    throw new Error(`Dognet coupons/filter zlyhal: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.data || [];
}

async function syncDognetCoupons() {
  console.log("Dognet sync: prihlasujem sa...");
  const token = await dognetLogin();

  console.log("Dognet sync: sťahujem kupóny...");
  const coupons = await fetchDognetCoupons(token);
  console.log(`Dognet sync: dostal som ${coupons.length} kupónov.`);

  let inserted = 0;
  for (const c of coupons) {
    const { error } = await supabase
      .from("coupons")
      .upsert(
        {
          code: c.code || c.coupon_code,
          shop_id: c.campaign?.domain || c.campaign?.name || "unknown",
          category: null,
          min_amount: 0,
          discount_percent: c.value || null,
          valid_from: c.valid_from || null,
          valid_until: c.valid_to || c.valid_until || null,
          is_active: true
        },
        { onConflict: "code,shop_id" }
      );

    if (!error) inserted++;
  }

  console.log(`Dognet sync: hotovo, zapísaných/aktualizovaných ${inserted} riadkov.`);
  return { total: coupons.length, inserted };
}

app.get("/api/dognet-sync", async (req, res) => {
  try {
    const result = await syncDognetCoupons();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- GET /api/coupons?shop=alza.sk -------------------------------------
app.get("/api/coupons", async (req, res) => {
  const shopId = req.query.shop;
  if (!shopId) {
    return res.status(400).json({ error: "chýba parameter 'shop'" });
  }

  const { data, error } = await supabase
    .from("coupons")
    .select("code, category, min_amount")
    .eq("shop_id", shopId)
    .eq("is_active", true);

  if (error) {
    console.error("Supabase error:", error);
    console.error("Cause:", error.cause);
    return res.status(500).json({ error: error.message, cause: String(error.cause) });
  }

  res.json({ coupons: data });
});

// ---- POST /api/coupon-result --------------------------------------------
// Telo požiadavky: { code: "ALZADNI30", shopId: "alza.sk", success: true }
app.post("/api/coupon-result", async (req, res) => {
  const { code, shopId, success } = req.body;

  if (!code || !shopId || typeof success !== "boolean") {
    return res.status(400).json({ error: "chýba code, shopId alebo success" });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("coupons")
    .select("id, success_count, fail_count")
    .eq("code", code)
    .eq("shop_id", shopId)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ error: "kupón sa v databáze nenašiel" });
  }

  const updates = success
    ? {
        success_count: existing.success_count + 1,
        fail_count: 0, // po úspechu resetuj počítadlo zlyhaní
        last_verified_at: new Date().toISOString()
      }
    : {
        fail_count: existing.fail_count + 1
      };

  // Ak zlyhal príliš veľakrát za sebou, automaticky ho vypni
  if (!success && existing.fail_count + 1 >= FAIL_THRESHOLD) {
    updates.is_active = false;
  }

  const { error: updateError } = await supabase
    .from("coupons")
    .update(updates)
    .eq("id", existing.id);

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  res.json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Backend beží na porte ${port}`);
});
