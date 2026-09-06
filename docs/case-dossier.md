# The case, and where it comes from

The court's material is not invented. It is the course's **case design dossier**
for the running project, committed here as
[`dossier/ASE26-tribunal-case-design-dossier.pdf`](dossier/ASE26-tribunal-case-design-dossier.pdf)
so that anyone can check the charge sheet against its source instead of taking
this repository's word for it.

This document exists because of Module 16's third decay path: reasons vanish,
because they lived in deleted chats. Until now the dossier lived in a downloads
folder on one laptop. Every prompt in `src/tribunal/personas.js` derives from
it, and none of them could be justified without it.

---

## The rule this document enforces

`src/tribunal/cases.js` holds the executable copy of case T-001 and it is
**reproduced from the dossier, not paraphrased**. The act alleged, all three
paragraphs of the base premises, all five lines of the agreed factual record,
and the question for judgment are the dossier's own words.

**If the two ever disagree, the dossier is right and the code is wrong.** A
paraphrased question is a different question, and a court that answers it is
answering something nobody asked. `CLAUDE.md` carries this as a standing rule:
never invent case material.

## The three parts the dossier fixes

| Part | Where it lives |
|---|---|
| **Case T-001, The Realm v. Jon Snow** — the accused, the deceased, the act alleged | `cases.js`, field `defendant` and the `ACT ALLEGED` block of `act` |
| **Base premises** — 200–300 words of background for a reader who does not know the story | `cases.js`, the `BASE PREMISES` block |
| **Agreed factual record** — five facts both sides must work with | `cases.js`, the `AGREED FACTUAL RECORD` block |
| **The question for judgment** — the exact issue, in the dossier's words | `cases.js`, field `question` |

The agreed factual record is the part that makes the case arguable. Two of its
lines cut for the defence (the city had surrendered and was burned anyway; the
campaign was promised to continue), two cut for the prosecution (she was
unarmed and not attacking; no council, detention or public surrender was
attempted), and the fifth cuts both ways. **Each line is a fact, never a
conclusion** — pitfall 13 in [`spec.md`](spec.md) records what happened the one
time an example sheet asserted a conclusion instead: all three judges quoted it
back.

## The simulation rule

Verbatim from the dossier, section 2, because it is the single most
consequential line in the prompts:

> *"The assigned seat fixes only each representative's procedural role. It does
> not fix an opinion, factual inference, proposed argument, or final position.
> Let the model reason in character."*

The deceased is called from a prosecution seat and the accused from a defence
seat. That is the dossier's design, and it is why a representative who reasons
its way to a conclusion that does not help the side which called it is the
design working rather than failing. A model handed a prosecution seat will
otherwise prosecute by reflex, so `personas.js` states the rule explicitly in
every representative's prompt.

## The scope note

Verbatim from the dossier, section 1:

> *"The Tribunal decides justified / not justified and gives reasons. It does
> not impose a sentence or combine the three opinions into one verdict."*

Both halves are now enforced, and only one of them was before:

- **No combined verdict** — the whole architecture. Three rulings side by side,
  no majority, no mean, no aggregate. It is part 1 of [`spec.md`](spec.md) and
  criterion S12.
- **No sentence** — the judges' prompts say so. This half had no rule behind it:
  a judge that added a punishment broke nothing, because nothing forbade it.
  Criterion S16 now does.

## The four representatives

The dossier assigns the cast and describes the manner of each in under 300
words total. `personas.js` adapts those descriptions into system prompts and
adds nothing to them.

| Seat | Representative | The dossier's signal |
|---|---|---|
| Defence | Jon Snow | plain-spoken; accepts blame quickly; undervalues his own judgment |
| Defence | Tyrion Lannister | quick and ironic; prefers negotiated limits and plans that leave people alive |
| Prosecution | Daenerys Targaryen | command and moral intensity; interprets the record herself, including evidence against her |
| Prosecution | Grey Worm | terse and concrete; trusts sequence — who acted, what was known, what alternatives existed |

## The three judges, and the research behind them

The dossier is explicit about what these profiles are, and every judge prompt
opens by saying it:

> *"Fictional proceeding. The profiles adapt judicial methods; they do not
> impersonate the judges or predict a real court."*

Each profile is drawn from three published Hebrew opinions. **This table is the
`why` behind three system prompts.** Without it, a later reader can see that a
judge reasons about proportionality but has no way to know where that came from,
and an agent asked to "improve" the prompt has nothing to be faithful to.

| Judge | Character signal | Opinions the profile derives from |
|---|---|---|
| **Aharon Barak** | Systematic, rights-centered; confident that legal principle can discipline public power | CA 6821/93 et al., *United Mizrahi Bank v. Migdal* (1995) · HCJ 5100/94, *Public Committee Against Torture in Israel v. Government of Israel* (1999) · HCJ 2056/04, *Beit Sourik Village Council v. Government of Israel* (2004) |
| **Menachem Elon** | Learned, tradition-minded; alert to the boundary between legal judgment and political choice | CA 546/78, *Bank Kupat Am v. Hendels* (1980), with FH 13/80 (1981) · CA 294/91, *Jerusalem Community Burial Society v. Kestenbaum* (1992), his dissent · HCJ 1635/90, *Jarzhevski v. Prime Minister* (1991) |
| **Meir Shamgar** | Sober, institutional; exact about legal powers and protective of concrete rights | CA 44/76, *Ata Textile Co. v. Schwartz* (1976) · HCJ 428/86, *Barzilai v. Government of Israel* (1986) · CA 6821/93 et al., *United Mizrahi Bank* (1995), his opinion read separately |

Two of the three are real public figures, which is why the disclaimer is in the
prompt itself and not only in a document. Each prompt describes **how that
method reasons, never what it should decide** — so what divides the bench is a
standard of judgement rather than an assigned outcome. That is also what makes
the bench's disagreement worth reporting.

**Spelled Aharon Barak**, as in the dossier's own research record. Its section
heading reads "Aaron"; the citation list does not.

### What the dossier says about its own sources

> *"Open Hebrew scans or full reproductions were retained locally for Bank
> Mizrahi, Jarzhevski, and Barzilai … two direct file downloads were blocked by
> the host's certificate/access configuration."*

Recorded here rather than smoothed over. The profiles rest on a review path
that was itself uneven, and a reader entitled to judge the prompts is entitled
to know that.
