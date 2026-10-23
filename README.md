# composite-sim

**One question, one instrument.**

"Did a goal happen before ETH crossed $3,000?" reads like one question. Run by
hand it is a fresh specification and a fresh resolution every time someone asks
it. This repository turns it into an instrument:

1. **Compose** it from atoms (events and thresholds on feeds) and four combinators:
   `before`, `and`, `or`, `within` (plus `not`).
2. **Read** it back as plain English, so a person can check what was built.
3. **Compile** it to a canonical, content-addressed specification. Commutative
   questions compile to the same id whatever order they were asked in.
4. **Execute** it against a day of feeds, returning the outcome and the moment the
   outcome became final, which is usually long before the market closes.

```
Will a goal be scored before ETH crosses $3,000?
  spec:7ec06f0c45226f5a  {"before":[{"event":"match.events","when":"first"},{"cross":">","feed":"ETH/USD","value":3000,"when":"first"}]}
  TRUE, final at 06:40, 53 min before close
```

## Why it matters

Composite markets multiply. Six atoms already support 78 two-atom composites;
twenty support 820. Specified and resolved one by one, the work grows with the
square of the atoms. Compiled, each atom is specified once and each combinator
is written once, and the catalogue costs nothing more to extend.

```
 6 atoms    78 composites   manual   156   executable  10
20 atoms   820 composites   manual  1640   executable  24
```

## Run it

```bash
npm test         # semantics, 480 random questions checked by stepping through time, ids, catalogue
npm run demo     # four questions on one market hour; try: node bin/demo.js 7
```

## Semantics

Evaluation is three-valued (true, false, pending) with knowledge limited to `now`.
`before(A, B)` is true the moment A happens if B has not, false the moment B
happens first (ties are not "before"), and false at close if neither does. `and`
settles on its first false, `or` on its first true, `within(A, s)` at `s`. The
test suite steps every second of the hour and checks the engine's final moment is
exactly the first moment the outcome is known, and that it never flips after.

Feeds are generated from a seed and shaped like their real counterparts. They
are not market data. This is an independent model, not Fermah's implementation.

## License

MIT. Built by ZERTH MAXX ([@0maxxdev](https://x.com/0maxxdev)).
