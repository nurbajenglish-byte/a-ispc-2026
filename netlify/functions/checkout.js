const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

function isEarlyBird() {
  return new Date() < new Date("2026-08-01T00:00:00Z");
}

function getActivePriceId() {
  return isEarlyBird()
    ? process.env.STRIPE_EARLY_BIRD_PRICE_ID
    : process.env.STRIPE_PRICE_ID;
}

exports.handler = async function(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const {
      teamName, division, schoolName, country,
      member1Name, member1Age, member2Name, member2Age, member3Name, member3Age,
      mentorName, mentorEmail
    } = JSON.parse(event.body);

    const errors = [];
    if (!teamName?.trim())    errors.push("Team name is required.");
    if (!["Junior","Senior"].includes(division)) errors.push("Division must be Junior or Senior.");
    if (!schoolName?.trim())  errors.push("School name is required.");
    if (!country?.trim())     errors.push("Country is required.");
    if (!member1Name?.trim()) errors.push("Member 1 name is required.");
    if (!member1Age?.trim())  errors.push("Member 1 age is required.");
    if (!member2Name?.trim()) errors.push("Member 2 name is required.");
    if (!member2Age?.trim())  errors.push("Member 2 age is required.");
    if (!mentorName?.trim())  errors.push("Mentor name is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mentorEmail)) errors.push("Valid mentor email is required.");
    if (errors.length > 0) return { statusCode: 400, headers, body: JSON.stringify({ error: errors.join(" ") }) };

    const eb = isEarlyBird();
    const metadata = {
      team_name: teamName.trim(), division,
      school_name: schoolName.trim(), country: country.trim(),
      member_1_name: member1Name.trim(), member_1_age: member1Age.trim(),
      mentor_name: mentorName.trim(), mentor_email: mentorEmail.trim().toLowerCase(),
      pricing_tier: eb ? "early_bird_70" : "standard_80"
    };
    if (member2Name?.trim()) { metadata.member_2_name = member2Name.trim(); metadata.member_2_age = member2Age?.trim() || ""; }
    if (member3Name?.trim()) { metadata.member_3_name = member3Name.trim(); metadata.member_3_age = member3Age?.trim() || ""; }

    const baseUrl = process.env.BASE_URL || "https://aispc2026.org";
    const tierLabel = eb ? "Early Bird — USD $70" : "USD $80";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: getActivePriceId(), quantity: 1 }],
      customer_email: mentorEmail.trim().toLowerCase(),
      payment_intent_data: {
        description: `A-ISPC 2026 Team Registration (${tierLabel}) — ${metadata.team_name} (${metadata.division})`
      },
      custom_text: {
        submit: {
          message: "Payment is collected by Emerald Horizon Ventures (Hong Kong) on behalf of A-ISPC 2026. Your bank statement will show EMERALD HORIZON VENTUR / A-ISPC. A receipt will be emailed to your mentor address after payment."
        }
      },
      metadata,
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel.html`
    });

    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url }) };

  } catch (err) {
    console.error("Stripe error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Unable to initiate payment. Please try again or contact support." }) };
  }
};
