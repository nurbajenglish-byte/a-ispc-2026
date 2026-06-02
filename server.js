// ─────────────────────────────────────────────────────────────────────────────
//  A-ISPC 2026 — Express Server
//  Emerald Horizon Ventures | Hong Kong
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

require("dotenv").config();
const express = require("express");
const path    = require("path");
const stripe  = require("stripe")(process.env.STRIPE_SECRET_KEY);

// ── Validate required environment variables on startup ───────────────────────
const REQUIRED_ENV = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_PRICE_ID",
  "STRIPE_EARLY_BIRD_PRICE_ID",
  "STRIPE_WEBHOOK_SECRET",
  "BASE_URL",
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[FATAL] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Early bird pricing logic ──────────────────────────────────────────────────
// Returns the correct Stripe Price ID based on today's date.
// Early bird: USD $70 until 31 July 2026 (inclusive, midnight UTC).
// Standard:   USD $80 from 1 August 2026 onwards.
function getActivePriceId() {
  const now          = new Date();
  const earlyBirdEnd = new Date("2026-08-01T00:00:00Z"); // 1 Aug 2026 UTC
  if (now < earlyBirdEnd) {
    return process.env.STRIPE_EARLY_BIRD_PRICE_ID;
  }
  return process.env.STRIPE_PRICE_ID;
}

function isEarlyBird() {
  return new Date() < new Date("2026-08-01T00:00:00Z");
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.post(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  handleWebhook
);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Route: Pricing info (used by frontend to show correct price) ──────────────
app.get("/api/pricing", (req, res) => {
  res.json({
    earlyBird : isEarlyBird(),
    price     : isEarlyBird() ? 70 : 80,
    deadline  : "2026-07-31",
  });
});

// ── Route: Create Checkout Session ───────────────────────────────────────────
app.post("/api/create-checkout-session", async (req, res) => {
  const {
    teamName,
    division,
    schoolName,
    country,
    member1Name, member1Age,
    member2Name, member2Age,
    member3Name, member3Age,
    mentorName,
    mentorEmail,
  } = req.body;

  // ── Server-side validation ─────────────────────────────────────────────────
  const errors = [];
  if (!teamName?.trim())    errors.push("Team name is required.");
  if (!["Junior", "Senior"].includes(division))
                            errors.push("Division must be Junior or Senior.");
  if (!schoolName?.trim())  errors.push("School name is required.");
  if (!country?.trim())     errors.push("Country is required.");
  if (!member1Name?.trim()) errors.push("Member 1 name is required.");
  if (!member1Age?.trim())  errors.push("Member 1 age is required.");
  if (!member2Name?.trim()) errors.push("Member 2 name is required (minimum 2 team members).");
  if (!member2Age?.trim())  errors.push("Member 2 age is required (minimum 2 team members).");
  if (!mentorName?.trim())  errors.push("Mentor teacher name is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mentorEmail))
                            errors.push("A valid mentor email address is required.");
  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(" ") });
  }

  // ── Build metadata ─────────────────────────────────────────────────────────
  const metadata = {
    team_name     : teamName.trim(),
    division,
    school_name   : schoolName.trim(),
    country       : country.trim(),
    member_1_name : member1Name.trim(),
    member_1_age  : member1Age.trim(),
    mentor_name   : mentorName.trim(),
    mentor_email  : mentorEmail.trim().toLowerCase(),
    pricing_tier  : isEarlyBird() ? "early_bird_70" : "standard_80",
  };
  if (member2Name?.trim()) {
    metadata.member_2_name = member2Name.trim();
    metadata.member_2_age  = member2Age?.trim() || "";
  }
  if (member3Name?.trim()) {
    metadata.member_3_name = member3Name.trim();
    metadata.member_3_age  = member3Age?.trim() || "";
  }

  // ── Create Stripe Checkout Session ────────────────────────────────────────
  try {
    const priceId   = getActivePriceId();
    const tierLabel = isEarlyBird() ? "Early Bird — USD $70" : "USD $80";

    const session = await stripe.checkout.sessions.create({
      mode                : "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: mentorEmail.trim().toLowerCase(),
      payment_intent_data: {
        description: `A-ISPC 2026 Team Registration (${tierLabel}) — ${metadata.team_name} (${metadata.division})`,
      },
      custom_text: {
        submit: {
          message:
            "Payment is collected by Emerald Horizon Ventures (Hong Kong) on behalf of " +
            "A-ISPC 2026. Your bank statement will show EMERALD HORIZON VENTUR / A-ISPC. " +
            "A receipt will be emailed to your mentor's address after payment.",
        },
      },
      metadata,
      success_url: `${process.env.BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url : `${process.env.BASE_URL}/cancel.html`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("[Stripe] Failed to create checkout session:", err.message);
    return res.status(500).json({
      error: "Unable to initiate payment. Please try again or contact support.",
    });
  }
});

// ── Route: Retrieve Session (for success page) ────────────────────────────────
app.get("/api/session", async (req, res) => {
  const { session_id } = req.query;
  if (!session_id || !session_id.startsWith("cs_")) {
    return res.status(400).json({ error: "Invalid session ID." });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    return res.status(200).json({
      paymentStatus : session.payment_status,
      customerEmail : session.customer_email,
      metadata      : session.metadata,
      amountTotal   : session.amount_total,
      currency      : session.currency,
    });
  } catch (err) {
    console.error("[Stripe] Failed to retrieve session:", err.message);
    return res.status(500).json({ error: "Could not retrieve session details." });
  }
});

// ── Webhook Handler ───────────────────────────────────────────────────────────
function handleWebhook(req, res) {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, sig, process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("[Webhook] Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.payment_status === "paid") {
        const m = session.metadata;
        console.log("─────────────────────────────────────────────");
        console.log("[Webhook] ✅ Payment confirmed");
        console.log(`  Team       : ${m.team_name}  (${m.division})`);
        console.log(`  School     : ${m.school_name}, ${m.country}`);
        console.log(`  Tier       : ${m.pricing_tier}`);
        console.log(`  Members    : ${[m.member_1_name, m.member_2_name, m.member_3_name].filter(Boolean).join(", ")}`);
        console.log(`  Mentor     : ${m.mentor_name} <${m.mentor_email}>`);
        console.log(`  Session ID : ${session.id}`);
        console.log("─────────────────────────────────────────────");
      }
      break;
    }
    case "checkout.session.expired": {
      console.log(`[Webhook] ⚠️  Session expired: ${event.data.object.id}`);
      break;
    }
    default:
      break;
  }
  res.status(200).json({ received: true });
}

// ── Catch-all ─────────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const tier = isEarlyBird() ? "EARLY BIRD ($70)" : "STANDARD ($80)";
  console.log(`\n🚀  A-ISPC 2026 server running`);
  console.log(`   Local:    http://localhost:${PORT}`);
  console.log(`   Pricing:  ${tier}`);
  console.log(`   Env:      ${process.env.NODE_ENV || "development"}\n`);
});
