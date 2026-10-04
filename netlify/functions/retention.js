import { getStore } from "@netlify/blobs";

// Anonymous retention tracking: records which random, anonymous device IDs
// were active on which calendar dates, so day-over-day return rate can be
// calculated later. No names, no accounts, nothing tied to the leaderboard -
// just an opaque ID a device generates for itself and keeps locally.
//
// POST /.netlify/functions/retention  { deviceId, date }  -> { ok: true }
// GET  /.netlify/functions/retention?date=YYYY-MM-DD       -> { date, count, deviceIds }
//
// Applying the same defensive validation lessons learned from the leaderboard
// incident from the start, rather than adding it after the fact: strict input
// validation, no trusting client-supplied arrays, sane size limits throughout.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEVICE_ID_PATTERN = /^[a-zA-Z0-9-]{10,64}$/;
const MAX_DEVICES_PER_DAY = 100000; // sane ceiling, comfortably above realistic traffic

function isValidDate(date){
  if (!DATE_PATTERN.test(date)) return false;
  const d = new Date(date + "T00:00:00Z");
  return !isNaN(d.getTime());
}

export default async (req) => {
  const headers = { "Content-Type": "application/json" };
  const url = new URL(req.url);

  try {
    const store = getStore("bookends-retention");

    if (req.method === "GET") {
      const date = url.searchParams.get("date");
      if (!date || !isValidDate(date)) {
        return new Response(JSON.stringify({ error: "valid date required (YYYY-MM-DD)" }), { status: 400, headers });
      }
      const raw = await store.get(`day:${date}`);
      let deviceIds = [];
      try { deviceIds = raw ? JSON.parse(raw) : []; } catch (e) { deviceIds = []; }
      if (!Array.isArray(deviceIds)) deviceIds = [];
      return new Response(JSON.stringify({ date, count: deviceIds.length, deviceIds }), { headers });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { deviceId, date } = body;

      if (typeof deviceId !== "string" || !DEVICE_ID_PATTERN.test(deviceId)) {
        return new Response(JSON.stringify({ error: "invalid deviceId" }), { status: 400, headers });
      }
      if (typeof date !== "string" || !isValidDate(date)) {
        return new Response(JSON.stringify({ error: "invalid date" }), { status: 400, headers });
      }

      const key = `day:${date}`;
      const raw = await store.get(key);
      let deviceIds = [];
      try { deviceIds = raw ? JSON.parse(raw) : []; } catch (e) { deviceIds = []; }
      if (!Array.isArray(deviceIds)) deviceIds = [];

      // De-duplicate - a device pinging twice in one day (lock-in and save)
      // should never create two entries.
      if (!deviceIds.includes(deviceId)) {
        if (deviceIds.length >= MAX_DEVICES_PER_DAY) {
          // Sane ceiling reached - silently accept without growing further,
          // rather than error, since this is a best-effort stat, not critical data.
          return new Response(JSON.stringify({ ok: true }), { headers });
        }
        deviceIds.push(deviceId);
        await store.set(key, JSON.stringify(deviceIds));
      }

      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = {
  path: "/.netlify/functions/retention"
};
