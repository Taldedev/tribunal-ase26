# Merge-Readiness Pack

Module 16's gate for this change: the four disciplines added to a working
court — a server-side record, a cacheable prompt prefix, a gate that installs
itself, and the reviewer artefacts.

**Five criteria, each shown by evidence and never by claim.** A criterion with
nothing behind it is NO EVIDENCE, not PASS. A gate that reports a pass it
cannot show is worse than no gate, because someone will trust it.

Produce a fresh one with `/merge-readiness`, which dispatches
[`merge-reviewer`](../.claude/agents/merge-reviewer.md) — the reviewer holds
these five criteria in its own instructions rather than being handed them at
review time.

---

## The cheap gates, run first

```
$ npm test
ℹ tests 365   ℹ suites 54   ℹ pass 365   ℹ fail 0

$ npm run build
dist/assets/index-BehKug4K.js  954.51 kB │ gzip: 286.78 kB
✓ built in 1.24s

$ npm run verify
  S9   key absent from the client bundle ......... ok
  S10  key absent from all git history .......... ok
Repository checks passed.

$ git config --get core.hooksPath
scripts
```

The last one is itself a criterion. S24 says the gate installs itself on `npm
install`, and this is the reading that shows it did.

---

## 1. Functional completeness — does it match the specification?

**PASS for the ten new criteria; the four layers are complete in code and one
of them is unverified in operation.**

[`spec.md`](spec.md) part 2 carries 25 numbered criteria. This change added ten
and every one of them has something that makes it true:

| Criterion | What makes it true |
|---|---|
| S16 no sentence imposed | `judgeSystemPrompt` in [`personas.js`](../src/tribunal/personas.js) |
| S17 shared segment identical in a wave | `buildSpeakerMessages` / `buildJudgeMessages` in [`protocol.js`](../src/tribunal/protocol.js) |
| S18 shared segment sent first | the `Segments` key order, and `client.js` sending it |
| S19 cached tokens recorded | `cachedTokensOf` in [`runCase.js`](../src/tribunal/runCase.js), `readCachedTokens` in [`openrouter.js`](../netlify/functions/openrouter.js) |
| S20 stored server-side, readable elsewhere | [`cases.js`](../netlify/functions/cases.js), [`schema.sql`](../supabase/schema.sql) |
| S21 every call its own row, failures included | `toCallRows` in [`casesApi.js`](../src/lib/casesApi.js) |
| S22 a refused save reported, never silent | the `recordError` banner in [`App.jsx`](../src/App.jsx) |
| S23 no database credential in the browser | `SUPABASE_*` read only inside `cases.js`; `npm run verify` |
| S24 the gate installs itself | `prepare` in [`package.json`](../package.json) |
| S25 CI runs the gate on push and pull request | [`gate.yml`](../.github/workflows/gate.yml) |

**The specification was rewritten before the code**, which is the order Module
10 asks for and the reverse of what version 2 did. `git log --follow
docs/spec.md` shows the criteria landing in `b8240df` and the implementation
after it.

**Not complete:** S20 is satisfied in code and **unproven in operation**. No
Supabase project is provisioned, so no row has ever been written. See criterion
2's unchecked list.

## 2. Sound verification — did the tests come from the specification?

**PASS, and this criterion is the strongest evidence in the pack.**

- 365 tests, 54 suites, written from [`spec.md`](spec.md) and
  [`interfaces.md`](interfaces.md) by an agent **forbidden to read `src/` or
  `netlify/`**. The rule is encoded in
  [`spec-test-writer.md`](../.claude/agents/spec-test-writer.md) rather than
  remembered.
- Every test names its criterion. S1 through S23 all appear in test titles:
  `grep -ohE "S[0-9]+" tests/*.test.js | sort -u`.
- **S24 and S25 appear in no test, correctly.** They are properties of a
  checkout and of a CI runner, not of a function. They are checked by the two
  readings at the top of this document.

**What the method found on its first run against version 3:** four defects and
four faults in the documents, recorded as pitfalls 27–30 in
[`spec.md`](spec.md) part 5 and in commit `9cf42a0`. The one worth naming here:
`CaseSummary` reported `distinctModels` and `CaseRow` had no column to store it
in, so every stored run of arrangement B would have reported one model across
all seven seats — and the comparison panel, whose entire subject is that
number, would have shown "1 of 7 seats" for every past case. Nothing failed.
The figure was simply wrong, in the direction that makes arrangement B look
pointless.

**No test was edited to make it pass.** The failing assertion — "no method
throws, on any argument, including none" — was met by adding the guard the
interface already required.

## 3. Engineering hygiene — does it fit this project's standards?

**PASS.**

- [`CLAUDE.md`](../CLAUDE.md) is 173 lines, hand-written, rules at both edges.
- Seven calls per deliberation: `CALLS_PER_RUN` unchanged, and the record's
  endpoint refuses a run claiming more.
- No new dependency. The record speaks to Supabase's REST interface over
  `fetch` rather than adding a client library; the suite still uses Node's own
  runner.
- Dependencies pinned to the versions actually installed and tested.
- Styling in `sx`. Function declarations in `src/tribunal/`. Comments say why.
- **One duplication removed rather than added:** the credential patterns had
  been copied into three scanners and now live only in
  [`security-patterns.yaml`](../security-patterns.yaml).

## 4. Rationale — did someone write down why?

**PASS.**

Twelve commits, each one logical change, each message saying why rather than
what. `git log` is the artefact. The one that had swept in unrelated files was
split before it was pushed, because the audit trail is part of what this
project is for.

Corrections were written as rules, not complaints: three new standing rules in
[`CLAUDE.md`](../CLAUDE.md) — the shared record goes first and nothing is
prepended to it; a record that failed is not a court that failed; no judge
imposes a sentence — and ten new pitfalls in [`spec.md`](spec.md) part 5, six
of them written before the work rather than after it.

## 5. Auditability — can the whole trail be followed?

**PASS for the trail; the map is new and unproven by use.**

[`requirements.md`](requirements.md) maps every requirement to the file or
command that satisfies it, and ends with four things that are not done. The
trail runs: `problem.md` → `spec.md` → `interfaces.md` → `tests/` → `git log` →
the gate.

Case material is auditable for the first time:
[`case-dossier.md`](case-dossier.md) and the dossier PDF beside it, including
the three published opinions behind each judge profile. Those three prompts
previously rested on a file in one person's downloads folder.

---

## Unchecked, and by whom it must be checked

Named rather than folded into a PASS. Every item needs a credential or a
setting that this work could not supply.

| What | Why it is unchecked | Who checks it |
|---|---|---|
| **A row has ever been written** | No Supabase project exists. `schema.sql` has never been run, so the tables are untested against a real Postgres and S20, S21 and S22 are verified in code only | whoever provisions the project: create it, run `supabase/schema.sql`, set the two variables, then **`npm run check:record`** — it writes a probe case and its call row, reads both back, checks that an unauthenticated request is refused, and deletes the probe |
| **A case read back in a second browser** | Same reason. `check:record` proves the round trip; this proves the point of it | the same person, after the above |
| **A non-zero `cachedTokens` on a real call** | Needs a live model call. The plumbing is tested; whether any chosen provider actually serves the prefix from cache is a fact about that provider, not about this code | run the same charge sheet twice and read The bill |
| **The cache breakpoint being refused, and the retry** | Pitfall 22 is a prediction. No provider has yet rejected it here | first live run against a provider that does |
| **CI passing** | The repository has not been pushed | GitHub, on the first push |
| **CI refusing a merge** | Branch protection is a setting in GitHub, not a file here. Until it is set, CI reports and does not block | Settings → Branches → protect `main` → require the `gate` check |

## The judging act

The reading act is done and its evidence is above. **The judging act is not
mine to do** — intent belongs to whoever owns this project, and two questions
in particular are theirs:

1. **The record is shared and unauthenticated.** Anyone who can open the site
   can read every charge sheet in it. That is written down as a decision in
   [`problem.md`](problem.md) and it is a decision, not a detail.
2. **Six of the new pitfalls were written before the work.** They are
   predictions. If any turns out wrong, the rewriting of it is worth as much as
   the prediction was.
