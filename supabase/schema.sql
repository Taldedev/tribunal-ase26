-- The record. Run this once in the Supabase SQL editor.
--
-- Two tables, and the split is the answer to the question the class was asked:
-- SQL or NoSQL, and what makes you lean that way.
--
-- A deliberation is nested and irregular - four speeches of prose, three
-- rulings each with a list of reasons - so it is stored as jsonb inside one
-- relational row. The call log is the opposite: seven identical-shaped rows per
-- run, every field numeric or a short string, and the questions actually put to
-- it are aggregates. "What did the judges cost, per model, across every run of
-- arrangement B" is the question this project exists to answer, and it is a
-- group-by over columns. The relational half is where the questions are; the
-- document half is where the reading is.

create table if not exists public.cases (
    run_id       text primary key,
    created_at   timestamptz not null default now(),
    config       text        not null,
    charge_sheet jsonb       not null,
    speeches     jsonb       not null default '[]'::jsonb,
    rulings      jsonb       not null default '[]'::jsonb,
    totals       jsonb,
    tally        jsonb,
    budget_usd   numeric,
    ok           boolean     not null default true
);

-- Cases are almost always read newest first.
create index if not exists cases_created_at_idx
    on public.cases (created_at desc);

create table if not exists public.model_calls (
    id                bigint generated always as identity primary key,
    run_id            text    not null references public.cases (run_id) on delete cascade,

    -- The seat that made the call, as the application knows it. Paired with
    -- run_id it is unique, so saving the same run twice corrects the rows
    -- rather than doubling them.
    call_id           text    not null,

    stage             text    not null check (stage in ('speech', 'verdict')),
    agent             text    not null,
    agent_title       text,
    role              text,

    -- Module 7 asks the log to carry the model, the verdict, the tokens, the
    -- cost and the time. Each of those is a column here rather than a key
    -- inside a document, because each of them is something to group by.
    model_id          text    not null,
    model_name        text,
    ok                boolean not null,
    error             text,
    verdict           text,
    prompt_tokens     integer not null default 0,
    completion_tokens integer not null default 0,
    total_tokens      integer not null default 0,

    -- What the provider served from its own cache. Kept beside the cost rather
    -- than subtracted from it: the saving is evidence, and evidence is shown.
    cached_tokens     integer not null default 0,

    cost_usd          numeric not null default 0,
    elapsed_ms        integer not null default 0,

    constraint model_calls_run_call_unique unique (run_id, call_id)
);

create index if not exists model_calls_run_id_idx
    on public.model_calls (run_id);

-- A failed call is a row too, so this index answers "which models refused".
create index if not exists model_calls_model_ok_idx
    on public.model_calls (model_id, ok);

-- ---------------------------------------------------------------------------
-- Row-level security, enabled with no policies at all.
--
-- This is deliberate and it is the point. The service-role key used by
-- netlify/functions/cases.js bypasses row-level security by design, which is
-- exactly why that key must never reach a browser. Every other key - the
-- anonymous key, an authenticated user's key, anything that leaks - is subject
-- to these tables' policies, and there are none, so it reads nothing and
-- writes nothing.
--
-- Least privilege, in Module 17's sense: with narrow powers the same breach
-- reaches one table. Here it reaches none.
alter table public.cases       enable row level security;
alter table public.model_calls enable row level security;
