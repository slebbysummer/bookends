import { getStore } from "@netlify/blobs";

// Simple key-value backend for the shared leaderboard, using Netlify Blobs.
// GET    /.netlify/functions/leaderboard?key=XYZ            -> { value }
// POST   /.netlify/functions/leaderboard  { key, entry }     -> { ok: true, entries }  (leaderboard keys only)
// POST   /.netlify/functions/leaderboard  { key, value }     -> { ok: true }            (non-leaderboard keys)
// DELETE /.netlify/functions/leaderboard?key=XYZ            -> { ok: true }
//
// IMPORTANT: leaderboard writes never accept a full array from the client.
// Anyone can call this endpoint directly (dev tools, curl) and bypass the
// game entirely, so a client that sent "here's the whole leaderboard, store
// it" could wipe out every other player's real scores in one request - which
// is exactly what happened before this was fixed. Now the server only ever
// accepts ONE entry at a time, reads the real current state itself, and
// merges just that one entry in - it can never be told to overwrite anyone
// else's data, no matter what a malicious request contains.

const LEADERBOARD_KEY_PATTERN = /^bookends-leaderboard:[a-z]+$/;
const MAX_PLAUSIBLE_SCORE = 150; // generous ceiling, comfortably above any realistic legitimate score
const MAX_NAME_LENGTH = 20;
const MAX_WORD_LENGTH = 50;

function sanitizeEntry(raw){
  if (!raw || typeof raw.name !== "string" || !raw.name.trim()) return null;
  if (typeof raw.score !== "number" || !isFinite(raw.score)) return null;
  return {
    name: raw.name.trim().slice(0, MAX_NAME_LENGTH),
    score: Math.max(0, Math.min(MAX_PLAUSIBLE_SCORE, Math.floor(raw.score))),
    longestWord: typeof raw.longestWord === "string" ? raw.longestWord.slice(0, MAX_WORD_LENGTH) : null,
    shortestWord: typeof raw.shortestWord === "string" ? raw.shortestWord.slice(0, MAX_WORD_LENGTH) : null,
  };
}

function parseExistingEntries(rawValue){
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

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
      const { key } = body;
      if (!key) return new Response(JSON.stringify({ error: "key required" }), { status: 400, headers });

      if (LEADERBOARD_KEY_PATTERN.test(key)) {
        const entry = sanitizeEntry(body.entry);
        if (!entry) {
          return new Response(JSON.stringify({ error: "invalid entry" }), { status: 400, headers });
        }

        const existingRaw = await store.get(key);
        const existing = parseExistingEntries(existingRaw);

        const idx = existing.findIndex(e =>
          e && typeof e.name === "string" && e.name.toLowerCase() === entry.name.toLowerCase()
        );

        if (idx >= 0) {
          existing[idx].score = Math.max(existing[idx].score, entry.score);
          existing[idx].longestWord = entry.longestWord;
          existing[idx].shortestWord = entry.shortestWord;
        } else {
          existing.push(entry);
        }

        await store.set(key, JSON.stringify(existing));
        return new Response(JSON.stringify({ ok: true, entries: existing }), { headers });
      }

      const { value } = body;
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
