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

// Name filtering used to live only in the browser's JS, which meant it could
// be skipped entirely by calling this endpoint directly - the exact same class
// of gap that let the score-forgery exploit through. It now lives here too.
const BLOCKED_WORDS = new Set(["2g1c", "acrotomophilia", "anal", "anilingus", "anus", "apeshit", "arsehole", "ass", "asshole", "assmunch", "autoerotic", "babeland", "bangbros", "bangbus", "bareback", "barenaked", "bastard", "bastardo", "bastinado", "bbw", "bdsm", "beaner", "beaners", "beastiality", "bestiality", "bimbos", "birdlock", "bitch", "bitches", "blowjob", "blumpkin", "bollocks", "bondage", "boner", "boob", "boobs", "bukkake", "bulldyke", "bullshit", "bunghole", "busty", "butt", "buttcheeks", "butthole", "camgirl", "camslut", "camwhore", "carpetmuncher", "cialis", "circlejerk", "clit", "clitoris", "clusterfuck", "cock", "cocks", "coon", "coons", "coprolagnia", "coprophilia", "cornhole", "creampie", "cum", "cumming", "cumshot", "cumshots", "cunnilingus", "cunt", "darkie", "daterape", "deepthroat", "dendrophilia", "dick", "dildo", "dingleberries", "dingleberry", "doggiestyle", "doggystyle", "dolcett", "domination", "dominatrix", "dommes", "dvda", "ecchi", "ejaculation", "erotic", "erotism", "escort", "eunuch", "fag", "faggot", "fecal", "felch", "fellatio", "feltch", "femdom", "figging", "fingerbang", "fingering", "fisting", "footjob", "frotting", "fuck", "fuckin", "fucking", "fucktards", "fudgepacker", "futanari", "g-spot", "gangbang", "genitals", "goatcx", "goatse", "gokkun", "goodpoop", "goregasm", "grope", "guro", "handjob", "hardcore", "hentai", "homoerotic", "honkey", "hooker", "horny", "humping", "incest", "intercourse", "jailbait", "jigaboo", "jiggaboo", "jiggerboo", "jizz", "juggs", "kike", "kinbaku", "kinkster", "kinky", "knobbing", "livesex", "lolita", "lovemaking", "masturbate", "masturbating", "masturbation", "milf", "mong", "motherfucker", "muffdiving", "nambla", "nawashi", "negro", "neonazi", "nigga", "nigger", "nimphomania", "nipple", "nipples", "nsfw", "nude", "nudity", "nutten", "nympho", "nymphomania", "octopussy", "omorashi", "orgasm", "orgy", "paedophile", "paki", "panties", "panty", "pedobear", "pedophile", "pegging", "penis", "pikey", "pissing", "pisspig", "playboy", "ponyplay", "poof", "poon", "poontang", "poopchute", "porn", "porno", "pornography", "pthc", "pubes", "punany", "pussy", "queaf", "queef", "quim", "raghead", "rape", "raping", "rapist", "rectum", "rimjob", "rimming", "s&m", "sadism", "santorum", "scat", "schlong", "scissoring", "semen", "sex", "sexcam", "sexo", "sexual", "sexuality", "sexually", "sexy", "shemale", "shibari", "shit", "shitblimp", "shitty", "shota", "shrimping", "skeet", "slanteye", "slut", "smut", "snatch", "snowballing", "sodomize", "sodomy", "spastic", "spic", "splooge", "spooge", "spunk", "strapon", "strappado", "suck", "sucks", "swastika", "swinger", "threesome", "throating", "thumbzilla", "tit", "tits", "titties", "titty", "topless", "tosser", "towelhead", "tranny", "tribadism", "tubgirl", "tushy", "twat", "twink", "twinkie", "undressing", "upskirt", "urophilia", "vagina", "viagra", "vibrator", "vorarephilia", "voyeur", "voyeurweb", "voyuer", "vulva", "wank", "wetback", "whore", "worldsex", "xx", "xxx", "yaoi", "yiffy", "zoophilia", "\ud83d\udd95"]);
const BLOCKED_PHRASES = ["2 girls 1 cup", "alabama hot pocket", "alaskan pipeline", "auto erotic", "baby batter", "baby juice", "ball gag", "ball gravy", "ball kicking", "ball licking", "ball sack", "ball sucking", "barely legal", "beaver cleaver", "beaver lips", "big black", "big breasts", "big knockers", "big tits", "black cock", "blonde action", "blonde on blonde action", "blow job", "blow your load", "blue waffle", "booty call", "brown showers", "brunette action", "bullet vibe", "bung hole", "camel toe", "carpet muncher", "chocolate rosebuds", "cleveland steamer", "clover clamps", "date rape", "deep throat", "dirty pillows", "dirty sanchez", "dog style", "doggie style", "doggy style", "donkey punch", "double dong", "double penetration", "dp action", "dry hump", "eat my ass", "female squirting", "foot fetish", "fuck buttons", "fudge packer", "gang bang", "gay sex", "giant cock", "girl on", "girl on top", "girls gone wild", "god damn", "golden shower", "goo girl", "group sex", "hand job", "hard core", "hot carl", "hot chick", "how to kill", "how to murder", "huge fat", "jack off", "jail bait", "jelly donut", "jerk off", "leather restraint", "leather straight jacket", "lemon party", "make me come", "male squirting", "menage a trois", "missionary position", "mound of venus", "mr hands", "muff diver", "nig nog", "nsfw images", "one cup two girls", "one guy one jar", "phone sex", "piece of shit", "piss pig", "pleasure chest", "pole smoker", "poop chute", "prince albert piercing", "raging boner", "reverse cowgirl", "rosy palm", "rosy palm and her 5 sisters", "rusty trombone", "shaved beaver", "shaved pussy", "splooge moose", "spread legs", "strap on", "strip club", "style doggy", "suicide girls", "sultry women", "tainted love", "taste my", "tea bagging", "tied up", "tight white", "tongue in a", "tub girl", "two girls one cup", "urethra play", "venus mound", "violet wand", "wet dream", "white power", "wrapping men", "wrinkled starfish", "yellow showers"];

function containsBlockedContent(name){
  const lower = name.toLowerCase();
  const tokens = lower.match(/[a-z0-9]+/g) || [];
  const strippedTokens = tokens.map(t => t.replace(/^[0-9]+|[0-9]+$/g, ""));
  if (tokens.some(t => BLOCKED_WORDS.has(t)) || strippedTokens.some(t => BLOCKED_WORDS.has(t))) return true;
  return BLOCKED_PHRASES.some(phrase => lower.includes(phrase));
}

function sanitizeEntry(raw){
  if (!raw || typeof raw.name !== "string" || !raw.name.trim()) return null;
  if (typeof raw.score !== "number" || !isFinite(raw.score)) return null;
  const name = raw.name.trim().slice(0, MAX_NAME_LENGTH);
  if (containsBlockedContent(name)) return null;
  return {
    name,
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
