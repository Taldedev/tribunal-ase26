# The problem

Module 6's four deliverables, written from the built system. Module 10 is
explicit that this is what to do once code exists — keep the specification
after it, and rewrite the specification before rewriting code — so this is the
artefact from here forward. Each deliverable is tested against M6's own test
for it.

---

## 1. Problem statement

> A person facing one hard, contested decision has no way to hear it argued
> from several sides at once. Asking a single language model produces one
> answer in one voice, delivered with the same confidence whether it is right
> or wrong, and the reader has no way to see where the question was genuinely
> difficult.

**Test — could several different solutions be proposed for it?** Yes. A single
model prompted to "argue both sides" in one answer. A chain where one model
drafts and a second critiques. A retrieval system over real case law. A human
debate forum. This project is one answer among several, not the only shape the
problem admits.

## 2. Stakeholders

| Who | What they need from it |
|---|---|
| **The person putting the case** | To see disagreement, not a summary. To be told when the panel failed rather than shown a default. |
| **The course instructor** | To open the repository and verify how the agent was directed — not to be told about it. |
| **The two of us building it** | A boundary each person can work inside without colliding. |
| **The model providers (OpenRouter and its upstreams)** | Not to be exceeded: rate limits respected, calls capped, no runaway loop. |
| **The named judges, and the estates of the deceased among them** | Not to be impersonated or to have decisions predicted for them. Two of the three are real public figures. The prompts adapt a published method and say so, in the prompt itself. |
| **Whoever maintains this after us** | Documents that explain the *why*, since the reasons will not survive in chat logs. |

**Test — nobody should discover themselves on the list too late.** The last two
rows are the ones this test earned. The judge row changed the prompts, which
now state that they adapt a published method and do not impersonate anyone; the
maintainer row is why `docs/` exists at all.

## 3. Definition of done

Done is all nine of these, each checkable by one person looking at the running
app or the repository:

1. A charge sheet with three named parts — defendant, act, exact question — can
   be submitted from a browser.
2. Four representatives each produce one speech from that sheet, called in
   parallel.
3. Three judges each produce one ruling from the sheet plus all four speeches,
   called in parallel, none of them shown another judge's answer.
4. Three verdicts are displayed side by side and are never averaged, merged, or
   reduced to a majority headline.
5. Every ruling carries a verdict and at least two reasons, or is displayed as
   a failure.
6. The protocol shows, per judge, what it decided and on what grounds.
7. The run reports tokens and cost per call and in total.
8. Arrangement A (one model) and arrangement B (a model per seat) can both be
   run and their results compared.
9. The OpenRouter key is never present in the browser bundle or in git history.

**Test — could two readers disagree about whether it was met?** Item 6 is the
weakest. "What it decided and on what grounds" is checkable; whether the
protocol is *legible* is not. Everything else resolves to yes or no by
inspection.

## 4. Out of scope

- **Any claim about real law.** This is a fictional proceeding. No jurisdiction,
  no statute, no precedent, no prediction of what a real court would hold.
- **Merging the verdicts.** Named here because it is the most obvious feature
  request and it would destroy the point. There is no majority view, no
  aggregate confidence, no final answer.
- **Accounts, authentication, multi-user storage.** History is IndexedDB, local
  to one browser.
- **Streaming the speeches token by token.** The panel is shown working; the
  text arrives whole.
- **Choosing models for quality.** The brief asks for the freest models that
  work, not the best ones.
- **A general-purpose debate tool.** It answers the question a charge sheet
  puts. It is not a chat interface.

**Test — could someone reasonably have expected this in scope?** Yes, for
merging the verdicts and for streaming. Both are listed for that reason. The
first is refused on principle; the second is a cost we accepted.
