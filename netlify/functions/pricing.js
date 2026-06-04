exports.handler = async function(event, context) {
  const earlyBirdEnd = new Date("2026-08-01T00:00:00Z");
  const now = new Date();
  const earlyBird = now < earlyBirdEnd;
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      earlyBird,
      price: earlyBird ? 70 : 80,
      deadline: "2026-07-31"
    })
  };
};
