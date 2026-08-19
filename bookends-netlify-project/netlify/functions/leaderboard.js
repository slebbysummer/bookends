const { getStore } = require("@netlify/blobs");

// Simple key-value backend for the shared leaderboard, using Netlify Blobs.
// GET    /.netlify/functions/leaderboard?key=XYZ      -> { value }
// POST   /.netlify/functions/leaderboard  { key, value } -> { ok: true }
// DELETE /.netlify/functions/leaderboard?key=XYZ      -> { ok: true }

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  try {
    const store = getStore("bookends-leaderboard");

    if (event.httpMethod === "GET") {
      const key = event.queryStringParameters && event.queryStringParameters.key;
      if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: "key required" }) };
      const value = await store.get(key);
      return { statusCode: 200, headers, body: JSON.stringify({ value: value === undefined ? null : value }) };
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { key, value } = body;
      if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: "key required" }) };
      await store.set(key, value);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (event.httpMethod === "DELETE") {
      const key = event.queryStringParameters && event.queryStringParameters.key;
      if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: "key required" }) };
      await store.delete(key);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
