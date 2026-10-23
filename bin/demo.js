#!/usr/bin/env node
// One question, one instrument. Compose, read, compile, execute.
//   node bin/demo.js [seed]
import * as C from "../src/composite.js";

const line = (s = "") => process.stdout.write(s + "\n");
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const rule = () => line(dim("-".repeat(74)));
const mm = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const A = C.atom;
const seed = Number(process.argv[2] || 1);
const tl = C.timeline(seed);

line(`\n\x1b[1mone question, one instrument\x1b[0m ${dim(`· a market hour, seed ${seed}`)}`);
rule();
const qs = [
  C.before(A("goal"), A("eth")),
  C.and(A("rain"), A("gas")),
  C.or(A("sla"), A("views")),
  C.within(A("goal"), 1800),
];
for (const q of qs) {
  const r = C.resolve(q, tl);
  const col = r.outcome === "true" ? "\x1b[36m" : "\x1b[90m";
  line(`\x1b[1m${r.question}\x1b[0m`);
  line(dim(`  ${r.id}  ${C.canonical(r.spec)}`));
  line(`  ${col}${r.outcome.toUpperCase()}\x1b[0m, final at ${mm(r.finalAt)}${r.earlyBy > 0 ? dim(`, ${Math.round(r.earlyBy / 60)} min before close`) : dim(", at close")}`);
  line();
}
rule();
line(dim("Same question in a different order compiles to the same instrument:"));
line(`  ${C.specId(C.and(A("rain"), A("gas")))}  rain and gas`);
line(`  ${C.specId(C.and(A("gas"), A("rain")))}  gas and rain`);
rule();
line(dim("Composite markets per atom count, and the work to stand them up:"));
for (const n of [4, 6, 10, 20]) {
  const c = C.catalogue(n);
  line(`  ${String(n).padStart(2)} atoms  ${String(c.composites).padStart(4)} composites   manual ${String(c.manualWork).padStart(5)}   executable ${String(c.executableWork).padStart(3)}`);
}
line();
