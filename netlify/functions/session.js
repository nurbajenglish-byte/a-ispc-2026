const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

exports.handler = async function(event, context) {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  const { session_id } = event.queryStringParameters || {};
  if (!session_id || !session_id.startsWith("cs_")) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid session ID." }) };
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        paymentStatus: session.payment_status,
        customerEmail: session.customer_email,
        metadata: session.metadata,
        amountTotal: session.amount_total,
        currency: session.currency
      })
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not retrieve session details." }) };
  }
};
