import { getStore } from "@netlify/blobs";

// Simple key-value backend for the shared leaderboard, using Netlify Blobs.
// GET    /.netlify/functions/leaderboard?key=XYZ      -> { value }
// POST   /.netlify/functions/leaderboard  { key, value } -> { ok: true }
// DELETE /.netlify/functions/leaderboard?key=XYZ      -> { ok: true }

export default async (req) => {
  const headers = { "Content-Type": "application/json" };
  const url = new URL(req.url);

  try {
    const store = getStore("bookends-leaderboard");

    if (req.method === "GET") {
      const key = url.searchParams.get("key");
      if (!key) return new Response(JSON.stringify({ error: "key required" }), { status: 400, headers });
      const value = await store.get(key);
      return new Response(JSON.stringify({ value: value === undefined ? null : value }), { headers });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { key, value } = body;
      if (!key) return new Response(JSON.stringify({ error: "key required" }), { status: 400, headers });
      await store.set(key, value);
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    if (req.method === "DELETE") {
      const key = url.searchParams.get("key");
      if (!key) return new Response(JSON.stringify({ error: "key required" }), { status: 400, headers });
      await store.delete(key);
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = {
  path: "/.netlify/functions/leaderboard"
};
