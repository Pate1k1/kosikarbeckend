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

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Po koľkých zlyhaniach za sebou sa kód automaticky vypne
const FAIL_THRESHOLD = 5;

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
app.listen(port, () => {
  console.log(`Backend beží na porte ${port}`);
});
