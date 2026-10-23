// One question, one instrument.
//
// Fermah, Oct 2026: "Did A happen before B crossed $X?" should be one programmable
// outcome, yet across 100,000+ resolved markets every composite still needed fresh
// specification and resolution work. The bottleneck is turning human-readable
// conditions into executable instruments.
//
// This file does exactly that, in four steps:
//   1. compose a question from atoms (events and thresholds on feeds) and combinators
//   2. render it back as plain English, so a person can read what was built
//   3. compile it to a canonical, content-addressed specification
//   4. execute it against a timeline, returning the outcome AND the moment the
//      outcome became final, which is usually long before the market closes
//
// Deterministic: the same seed produces the same day, in Node and in the browser.

/* ---------- atoms ---------- */

export const ATOMS = {
  goal:  { id: "goal",  phrase: "a goal is scored",            base: "a goal be scored",            short: "a goal",        kind: "event",     feed: "match.events" },
  eth:   { id: "eth",   phrase: "ETH crosses $3,000",          base: "ETH cross $3,000",            short: "ETH > $3,000",  kind: "threshold", feed: "ETH/USD", op: ">", value: 3000 },
  gas:   { id: "gas",   phrase: "gas tops 80 gwei",            base: "gas top 80 gwei",             short: "gas > 80 gwei", kind: "threshold", feed: "gas.gwei", op: ">", value: 80 },
  views: { id: "views", phrase: "the video passes 1M views",   base: "the video pass 1M views",     short: "views > 1M",    kind: "threshold", feed: "video.views", op: ">", value: 1000000 },
  rain:  { id: "rain",  phrase: "rain starts in the postcode", base: "rain start in the postcode",  short: "rain",          kind: "event",     feed: "weather.10115" },
  sla:   { id: "sla",   phrase: "the API breaches its SLA",    base: "the API breach its SLA",      short: "SLA breach",    kind: "event",     feed: "status.api" },
};
export const ATOM_IDS = Object.keys(ATOMS);

/* ---------- expressions ---------- */

export const atom = (id) => { if (!ATOMS[id]) throw new Error(`unknown atom ${id}`); return { op: "atom", id }; };
export const before = (a, b) => ({ op: "before", args: [a, b] });
export const and = (a, b) => ({ op: "and", args: [a, b] });
export const or = (a, b) => ({ op: "or", args: [a, b] });
export const not = (a) => ({ op: "not", args: [a] });
export const within = (a, seconds) => ({ op: "within", args: [a], seconds });

export const OPERATORS = {
  before: { label: "before", arity: 2, ordered: true },
  and:    { label: "and", arity: 2, ordered: false },
  or:     { label: "or", arity: 2, ordered: false },
  within: { label: "within", arity: 1, ordered: true },
};

/* ---------- 2. plain English ---------- */

const clock = (s) => {
  const m = Math.round(s / 60);
  return m >= 60 && m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minutes`;
};
// mood "base" follows "Will", mood "present" follows "before"
const clause = (e, mood = "base") => {
  switch (e.op) {
    case "atom": return mood === "base" ? ATOMS[e.id].base : ATOMS[e.id].phrase;
    case "not": return mood === "base" ? `it not be true that ${clause(e.args[0], "present")}` : `it is not true that ${clause(e.args[0], "present")}`;
    case "within": return `${clause(e.args[0], mood)} within ${clock(e.seconds)}`;
    case "before": return `${clause(e.args[0], mood)} before ${clause(e.args[1], "present")}`;
    case "and": return `${clause(e.args[0], mood)} and ${clause(e.args[1], mood)}`;
    case "or": return `${clause(e.args[0], mood)} or ${clause(e.args[1], mood)}`;
    default: throw new Error(`unknown op ${e.op}`);
  }
};
export function sentence(e) { return `Will ${clause(e, "base")}?`; }

/* ---------- 3. canonical, content-addressed specification ---------- */

// The spec is what executes. Commutative operators sort their arguments, so two
// wordings of the same question compile to the same instrument and the same id.
export function spec(e) {
  switch (e.op) {
    case "atom": {
      const a = ATOMS[e.id];
      return a.kind === "event"
        ? { when: "first", event: a.feed }
        : { when: "first", feed: a.feed, cross: a.op, value: a.value };
    }
    case "not": return { not: spec(e.args[0]) };
    case "within": return { within_s: e.seconds, of: spec(e.args[0]) };
    case "before": return { before: [spec(e.args[0]), spec(e.args[1])] };
    case "and":
    case "or": {
      const parts = e.args.map(spec).sort((x, y) => canonical(x).localeCompare(canonical(y)));
      return { [e.op]: parts };
    }
    default: throw new Error(`unknown op ${e.op}`);
  }
}
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
// 64 bits of FNV-1a style hashing over the canonical spec, as two 32-bit lanes.
export function specId(e) {
  const s = canonical(spec(e));
  let h1 = 0x811c9dc5 >>> 0, h2 = 0x01000193 >>> 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c ^ (h1 >>> 7), 0x01000193) >>> 0;
  }
  return "spec:" + h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/* ---------- a day of feeds ---------- */

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One market hour of feeds, sampled every `step` seconds. */
export function timeline(seed = 1, close = 3600, step = 10) {
  const r = rng(seed);
  const n = Math.floor(close / step) + 1;
  const t = Array.from({ length: n }, (_, i) => i * step);
  const walk = (start, vol, drift) => {
    const out = [start]; let v = start;
    for (let i = 1; i < n; i++) { v += (r() - 0.5) * vol + drift; out.push(v); }
    return out;
  };
  const eth = walk(2955 + r() * 30, 9, 0.12 + (r() - 0.5) * 0.5);
  const gas = (() => {
    const out = []; let v = 44 + r() * 14;
    for (let i = 0; i < n; i++) { v += (r() - 0.5) * 3.2 + (r() < 0.012 ? 12 + r() * 20 : 0) - (v - 48) * 0.015; out.push(Math.max(8, v)); }
    return out;
  })();
  const views = (() => {
    const out = []; let v = 610000 + r() * 160000; const rate = 70 + r() * 110;
    for (let i = 0; i < n; i++) { v += rate * step * (0.6 + r() * 0.8); out.push(v); }
    return out;
  })();
  const at = (p) => (r() < p ? Math.round((r() * close) / step) * step : Infinity);
  const goals = [];
  for (let k = 0, g = at(0.8); k < 3 && Number.isFinite(g) && g <= close; k++) { goals.push(g); g = g + 600 + Math.round(r() * 1400 / step) * step; }
  const events = { goal: goals, rain: [at(0.6)].filter(Number.isFinite), sla: [at(0.45)].filter(Number.isFinite) };
  const firstCross = (arr, value) => { for (let i = 0; i < arr.length; i++) if (arr[i] > value) return t[i]; return Infinity; };
  const first = {
    goal: events.goal.length ? events.goal[0] : Infinity,
    rain: events.rain.length ? events.rain[0] : Infinity,
    sla: events.sla.length ? events.sla[0] : Infinity,
    eth: firstCross(eth, ATOMS.eth.value),
    gas: firstCross(gas, ATOMS.gas.value),
    views: firstCross(views, ATOMS.views.value),
  };
  return { seed, close, step, t, series: { eth, gas, views }, events, first };
}

/* ---------- 4. execute ---------- */

/**
 * Evaluate with knowledge up to `now`. Three-valued: true, false, or pending.
 * `at` is the moment the value became final. Ties do not count as "before".
 */
export function evaluate(e, tl, now = tl.close) {
  const P = { state: "pending", at: null };
  switch (e.op) {
    case "atom": {
      const ta = tl.first[e.id];
      if (ta <= now) return { state: "true", at: ta };
      if (now >= tl.close) return { state: "false", at: tl.close };
      return P;
    }
    case "not": {
      const v = evaluate(e.args[0], tl, now);
      return v.state === "pending" ? P : { state: v.state === "true" ? "false" : "true", at: v.at };
    }
    case "within": {
      const end = Math.min(e.seconds, tl.close);
      const v = evaluate(e.args[0], tl, Math.min(now, end));
      if (v.state === "true" && v.at <= end) return v;
      if (now >= end) return { state: "false", at: end };
      return P;
    }
    case "before": {
      const ta = firstTrue(e.args[0], tl), tb = firstTrue(e.args[1], tl);
      const a = ta <= now, b = tb <= now;
      if (a && (!b || ta < tb)) return { state: "true", at: ta };
      if (b && (!a || tb <= ta)) return { state: "false", at: tb };
      if (now >= tl.close) return { state: "false", at: tl.close };
      return P;
    }
    case "and": {
      const vs = e.args.map((x) => evaluate(x, tl, now));
      const f = vs.filter((v) => v.state === "false");
      if (f.length) return { state: "false", at: Math.min(...f.map((v) => v.at)) };
      if (vs.every((v) => v.state === "true")) return { state: "true", at: Math.max(...vs.map((v) => v.at)) };
      return P;
    }
    case "or": {
      const vs = e.args.map((x) => evaluate(x, tl, now));
      const tr = vs.filter((v) => v.state === "true");
      if (tr.length) return { state: "true", at: Math.min(...tr.map((v) => v.at)) };
      if (vs.every((v) => v.state === "false")) return { state: "false", at: Math.max(...vs.map((v) => v.at)) };
      return P;
    }
    default: throw new Error(`unknown op ${e.op}`);
  }
}
function firstTrue(e, tl) {
  const v = evaluate(e, tl, tl.close);
  return v.state === "true" ? v.at : Infinity;
}

/** Resolve a question end to end: what it says, what executes, and what happened. */
export function resolve(e, tl) {
  const v = evaluate(e, tl, tl.close);
  return { question: sentence(e), id: specId(e), spec: spec(e), outcome: v.state, finalAt: v.at, earlyBy: tl.close - v.at };
}

/* ---------- the catalogue ---------- */

/**
 * Two-atom composite markets a set of atoms supports, and the work to stand them up.
 * Manual: every composite is specified and resolved on its own.
 * Executable: each atom is specified once, each combinator written once.
 */
export function catalogue(atoms, windows = 3, opts = {}) {
  const a = Math.max(0, Math.floor(atoms));
  const counts = { before: a * (a - 1), and: (a * (a - 1)) / 2, or: (a * (a - 1)) / 2, within: a * windows };
  const composites = counts.before + counts.and + counts.or + counts.within;
  const perComposite = opts.perComposite ?? 2;
  const combinators = opts.combinators ?? 4;
  return { atoms: a, counts, composites, manualWork: composites * perComposite, executableWork: a + combinators };
}
