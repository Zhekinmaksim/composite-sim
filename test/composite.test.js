import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../src/composite.js";

const A = C.atom;
// a hand-built day, so semantics can be checked exactly
const day = (first, close = 3600) => ({ close, step: 10, first: { goal: Infinity, eth: Infinity, gas: Infinity, views: Infinity, rain: Infinity, sla: Infinity, ...first } });

test("before: true the moment A happens, if B has not", () => {
  const r = C.evaluate(C.before(A("goal"), A("eth")), day({ goal: 420, eth: 900 }));
  assert.deepEqual(r, { state: "true", at: 420 });
});

test("before: false the moment B happens first, and ties are not 'before'", () => {
  assert.deepEqual(C.evaluate(C.before(A("goal"), A("eth")), day({ goal: 900, eth: 420 })), { state: "false", at: 420 });
  assert.deepEqual(C.evaluate(C.before(A("goal"), A("eth")), day({ goal: 500, eth: 500 })), { state: "false", at: 500 });
});

test("before: false at close when neither happens", () => {
  assert.deepEqual(C.evaluate(C.before(A("goal"), A("eth")), day({})), { state: "false", at: 3600 });
});

test("and settles early on the first false, or settles early on the first true", () => {
  const d = day({ rain: 300, sla: 2000 });
  assert.deepEqual(C.evaluate(C.and(A("rain"), A("sla")), d), { state: "true", at: 2000 });
  assert.deepEqual(C.evaluate(C.or(A("rain"), A("sla")), d), { state: "true", at: 300 });
  assert.deepEqual(C.evaluate(C.within(A("sla"), 1800), d), { state: "false", at: 1800 });
});

test("knowledge is respected: before the deciding moment the outcome is pending", () => {
  const d = day({ goal: 420, eth: 900 });
  assert.equal(C.evaluate(C.before(A("goal"), A("eth")), d, 410).state, "pending");
  assert.equal(C.evaluate(C.before(A("goal"), A("eth")), d, 420).state, "true");
});

// random expressions over the real generator, checked by stepping through time
function randomExpr(r, depth = 0) {
  const leaf = () => A(C.ATOM_IDS[Math.floor(r() * C.ATOM_IDS.length)]);
  if (depth >= 2 || r() < 0.3) return leaf();
  const k = Math.floor(r() * 5);
  if (k === 0) return C.before(randomExpr(r, depth + 1), randomExpr(r, depth + 1));
  if (k === 1) return C.and(randomExpr(r, depth + 1), randomExpr(r, depth + 1));
  if (k === 2) return C.or(randomExpr(r, depth + 1), randomExpr(r, depth + 1));
  if (k === 3) return C.within(randomExpr(r, depth + 1), 600 * (1 + Math.floor(r() * 5)));
  return C.not(randomExpr(r, depth + 1));
}

test("the reported final moment is the first moment the outcome is known, and it never changes after", () => {
  const r = C.rng(2026);
  let checked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const tl = C.timeline(seed);
    for (let k = 0; k < 12; k++) {
      const e = randomExpr(r);
      const final = C.evaluate(e, tl, tl.close);
      let firstKnown = null;
      for (let now = 0; now <= tl.close; now += tl.step) {
        const v = C.evaluate(e, tl, now);
        if (v.state !== "pending") {
          if (firstKnown === null) firstKnown = now;
          assert.equal(v.state, final.state, `${C.sentence(e)} flipped at ${now}s`);
        }
      }
      assert.equal(firstKnown, final.at, `${C.sentence(e)}: engine says ${final.at}s, stepping says ${firstKnown}s`);
      checked++;
    }
  }
  assert.equal(checked, 480);
});

test("one question, one instrument: wording order does not change commutative questions", () => {
  assert.equal(C.specId(C.and(A("rain"), A("gas"))), C.specId(C.and(A("gas"), A("rain"))));
  assert.equal(C.specId(C.or(A("sla"), A("views"))), C.specId(C.or(A("views"), A("sla"))));
  assert.notEqual(C.specId(C.before(A("rain"), A("gas"))), C.specId(C.before(A("gas"), A("rain"))));
  assert.notEqual(C.specId(C.and(A("rain"), A("gas"))), C.specId(C.or(A("rain"), A("gas"))));
  assert.match(C.specId(A("goal")), /^spec:[0-9a-f]{16}$/);
});

test("plain English reads as a question", () => {
  assert.equal(C.sentence(C.before(A("goal"), A("eth"))), "Will a goal be scored before ETH crosses $3,000?");
  assert.equal(C.sentence(C.within(A("goal"), 1800)), "Will a goal be scored within 30 minutes?");
});

test("days are deterministic per seed and differ across seeds", () => {
  assert.deepEqual(C.timeline(7).first, C.timeline(7).first);
  const outcomes = new Set();
  for (let s = 1; s <= 20; s++) outcomes.add(C.resolve(C.before(A("goal"), A("eth")), C.timeline(s)).outcome);
  assert.equal(outcomes.size, 2, "the same question should resolve both ways across days");
});

test("the catalogue grows quadratically while executable work grows linearly", () => {
  const a = C.catalogue(6), b = C.catalogue(12);
  assert.equal(a.composites, 6 * 5 + 15 + 15 + 18);
  assert.ok(b.composites / a.composites > 3, "doubling atoms should more than triple composites");
  assert.equal(b.executableWork - a.executableWork, 6, "executable work grows by one per atom");
  assert.ok(b.manualWork > 30 * b.executableWork);
});
