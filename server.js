// ─────────────────────────────────────────────────────────────────────────────
//  A-ISPC 2026 — Express Server
//  Emerald Horizon Ventures | Hibiscus International School (KL)
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

// ── Middleware ────────────────────────────────────────────────────────────────

// Stripe webhooks require the RAW request body for signature verification.
// This route MUST be registered BEFORE express.json().
app.post(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  handleWebhook
);

// Standard JSON body parser for all other routes
app.use(express.json());

// Serve everything in /public as static files
app.use(express.static(path.join(__dirname, "public")));

// ── Route: Create Checkout Session ───────────────────────────────────────────
//
// POST /api/create-checkout-session
//
// Expected JSON body:
// {
//   teamName      : string  (required)
//   division      : "Junior" | "Senior"  (required)
//   schoolName    : string  (required)
//   country       : string  (required)
//   member1Name   : string  (required)
//   member1Age    : string  (required)
//   member2Name   : string  (optional)
//   member2Age    : string  (optional)
//   member3Name   : string  (optional)
//   member3Age    : string  (optional)
//   mentorName    : string  (required)
//   mentorEmail   : string  (required)
// }

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

  // ── Build metadata object ──────────────────────────────────────────────────
  // Stripe metadata values must be strings; omit empty optional fields.
  const metadata = {
    team_name   : teamName.trim(),
    division,
    school_name : schoolName.trim(),
    country     : country.trim(),
    member_1_name : member1Name.trim(),
    member_1_age  : member1Age.trim(),
    mentor_name   : mentorName.trim(),
    mentor_email  : mentorEmail.trim().toLowerCase(),
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
    const session = await stripe.checkout.sessions.create({
      mode               : "payment",
      payment_method_types: ["card"],

      line_items: [
        {
          price    : process.env.STRIPE_PRICE_ID,
          quantity : 1,
        },
      ],

      // Pre-fill the customer email with the mentor's email
      customer_email: mentorEmail.trim().toLowerCase(),

      // Appears on the payment intent and Stripe Dashboard transaction detail.
      // Also surfaces on some bank statement views and dispute evidence.
      payment_intent_data: {
        description: `A-ISPC 2026 Team Registration (Online Round) — ${metadata.team_name} (${metadata.division})`,
      },

      // Footer shown on the Stripe-hosted checkout page.
      // Clarifies the commercial entity behind the .org domain to prevent
      // registrant confusion and reduce chargebacks.
      custom_text: {
        submit: {
          message:
            "Payment is collected by Emerald Horizon Ventures (Hong Kong) on behalf of " +
            "A-ISPC 2026. Your bank statement will show EMERALD HORIZON VENTUR / A-ISPC. " +
            "A receipt will be emailed to your mentor's address after payment.",
        },
      },

      // All registration data stored against this payment in Stripe Dashboard
      metadata,

      // Redirect URLs — BASE_URL set in .env (no trailing slash)
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
//
// GET /api/session?session_id=cs_...
//
// Used by success.html to display confirmed registration details.

app.get("/api/session", async (req, res) => {
  const { session_id } = req.query;

  if (!session_id || !session_id.startsWith("cs_")) {
    return res.status(400).json({ error: "Invalid session ID." });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // Only expose safe, non-sensitive fields to the frontend
    return res.status(200).json({
      paymentStatus : session.payment_status,  // "paid" | "unpaid" | "no_payment_required"
      customerEmail : session.customer_email,
      metadata      : session.metadata,
      amountTotal   : session.amount_total,    // in smallest currency unit (cents/HKD fen)
      currency      : session.currency,
    });

  } catch (err) {
    console.error("[Stripe] Failed to retrieve session:", err.message);
    return res.status(500).json({ error: "Could not retrieve session details." });
  }
});

// ── Webhook Handler ───────────────────────────────────────────────────────────
//
// POST /api/webhook
//
// Stripe sends signed events here. We verify the signature, then act on
// checkout.session.completed — the canonical "payment confirmed" event.

function handleWebhook(req, res) {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,                             // raw Buffer (express.raw middleware)
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("[Webhook] Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ── Handle event types ───────────────────────────────────────────────────
  switch (event.type) {

    case "checkout.session.completed": {
      const session = event.data.object;

      if (session.payment_status === "paid") {
        const m = session.metadata;

        console.log("─────────────────────────────────────────────");
        console.log("[Webhook] ✅ Payment confirmed");
        console.log(`  Team       : ${m.team_name}  (${m.division})`);
        console.log(`  School     : ${m.school_name}, ${m.country}`);
        console.log(`  Members    : ${[m.member_1_name, m.member_2_name, m.member_3_name].filter(Boolean).join(", ")}`);
        console.log(`  Mentor     : ${m.mentor_name} <${m.mentor_email}>`);
        console.log(`  Session ID : ${session.id}`);
        console.log("─────────────────────────────────────────────");

        // ── TODO (post-MVP): add any of the following here ──────────────
        //   • Write registration record to a database
        //   • Send confirmation email via SendGrid / Postmark
        //   • Post a notification to a Slack / Discord channel
        //   • Add entry to a Google Sheet via API
        // ────────────────────────────────────────────────────────────────
      }
      break;
    }

    case "checkout.session.expired": {
      const session = event.data.object;
      console.log(`[Webhook] ⚠️  Session expired: ${session.id}`);
      // TODO: optionally notify the team to re-register
      break;
    }

    default:
      // Silently ignore event types we don't handle
      break;
  }

  // Acknowledge receipt to Stripe (must respond within 30s)
  res.status(200).json({ received: true });
}

// ── Catch-all: serve index.html for any unmatched GET (SPA-friendly) ─────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  A-ISPC 2026 server running`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Env:     ${process.env.NODE_ENV || "development"}\n`);
});
