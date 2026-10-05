// Reads daily visitor counts from Plausible's Stats API, keeping the API key
// entirely server-side - it's a real secret credential, unlike the anonymous
// device IDs elsewhere in this project, so it never touches client-facing code.
//
// GET /.netlify/functions/plausible-stats?date=YYYY-MM-DD -> { date, visitors }

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SITE_ID = "bookendsdaily.com";

function isValidDate(date){
  if (!DATE_PATTERN.test(date)) return false;
  const d = new Date(date + "T00:00:00Z");
  return !isNaN(d.getTime());
}

export default async (req) => {
  const headers = { "Content-Type": "application/json" };
  const url = new URL(req.url);

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  const date = url.searchParams.get("date");
  if (!date || !isValidDate(date)) {
    return new Response(JSON.stringify({ error: "valid date required (YYYY-MM-DD)" }), { status: 400, headers });
  }

  const apiKey = process.env.PLAUSIBLE_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "server not configured - missing API key" }), { status: 500, headers });
  }

  try {
    const plausibleUrl = `https://plausible.io/api/v1/stats/aggregate?site_id=${encodeURIComponent(SITE_ID)}&period=day&date=${date}&metrics=visitors`;
    const res = await fetch(plausibleUrl, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Plausible API request failed", status: res.status }), { status: 502, headers });
    }

    const data = await res.json();
    const visitors = data && data.results && data.results.visitors ? data.results.visitors.value : null;

    return new Response(JSON.stringify({ date, visitors }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = {
  path: "/.netlify/functions/plausible-stats"
};
