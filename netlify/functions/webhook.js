const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

exports.handler = async function(event, context) {
  const sig = event.headers["stripe-signature"];
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body, sig, process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    if (session.payment_status === "paid") {
      const m = session.metadata;
      console.log("Payment confirmed:", m.team_name, m.division, m.school_name, m.country);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
