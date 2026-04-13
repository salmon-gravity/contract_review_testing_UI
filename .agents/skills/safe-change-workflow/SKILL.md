---
name: safe-change-workflow
description: Use this for normal software work in this repo: bug fixes, feature changes, refactors, and test updates. Best when the task may touch multiple files, needs code-path discovery first, or should end with a strong review. Trigger phrases include: investigate this bug, implement this feature, update this flow, trace where this is handled, make the smallest safe change, review this change, check for regressions, and add tests.
---

# Purpose

Follow the repo's default low-burn workflow:
- keep the main session efficient
- use exploration before edits when scope is unclear
- make the smallest safe change
- finish with a strong review for correctness and missing tests

# When to use

Use this skill when the request is about:
- fixing a bug
- implementing or modifying a feature
- tracing an unfamiliar code path
- refactoring a bounded area
- updating tests after a code change
- reviewing a non-trivial local change

Do not use this skill for:
- pure explanation with no repo work
- broad architecture strategy with no code changes yet
- release/admin tasks unrelated to code edits

# Workflow

## 1) Classify the task

First decide which of these it is:

- **Simple scoped change**
  - one file or one clear code path
  - behavior is already understood
  - likely small edit + test update

- **Unclear or multi-file change**
  - ownership or entry point is unclear
  - likely touches multiple files
  - bug requires tracing
  - request says investigate, trace, find where, or understand first

- **Risky change**
  - auth, payments, permissions, data integrity, migrations, concurrency
  - public API changes
  - complex state changes
  - broad refactor

## 2) Exploration step

If the task is **unclear or multi-file**, explicitly spawn `explorer_fast` first.

Ask it to:
- map the execution path
- identify relevant files and symbols
- call out assumptions, risks, and unknowns
- stay read-only

Wait for the result before editing.

If the task is a **simple scoped change**, skip the explorer unless the code path becomes unclear.

## 3) Implementation step

Implement the **smallest safe change** that solves the request.

Rules:
- avoid unrelated refactors
- preserve existing architecture unless a change is necessary
- update only the files needed
- keep diffs reviewable
- if behavior changes, update or add tests
- if the request is ambiguous, prefer the least risky interpretation and state the assumption

## 4) Verification step

After editing:
- run the most relevant tests for the touched area when available
- if there is no clear test target, at least identify what should be verified manually
- summarize touched files and what changed

## 5) Review step

If the task is **risky**, **multi-file**, or produced a meaningful diff, explicitly spawn `reviewer_strong`.

Ask it to review for:
- correctness bugs
- regressions
- edge cases
- missing or weak tests
- security-sensitive mistakes

Wait for the result.
If it finds a real issue, fix it and briefly re-check the affected area.

## 6) Final response format

Return:
- what changed
- touched files
- tests run or manual verification needed
- important assumptions or risks
- any follow-up worth doing next

# Delegation templates

## Explorer template
Use `explorer_fast` to map the relevant files, symbols, entry points, and likely execution path for this task. Stay read-only. Return a concise summary with risks and recommended next step.

## Reviewer template
Use `reviewer_strong` to review this change for correctness, regressions, edge cases, and missing tests. Lead with concrete findings and smallest safe fixes.

# Decision defaults

- Prefer **not** to spawn subagents for trivial one-file edits.
- Prefer `explorer_fast` before editing when the path is unclear.
- Prefer `reviewer_strong` after non-trivial edits.
- Keep the main thread concise and execution-focused.