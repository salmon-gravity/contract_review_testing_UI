# AGENTS.md

## Working style
- For broad codebase discovery, dependency tracing, and "where does this live?" questions, use `explorer_fast` first.
- Keep exploration read-only unless I explicitly ask for code changes.
- For straightforward implementation work, make the smallest defensible change and avoid unrelated edits.
- For risky refactors, migrations, auth/payment logic, concurrency issues, and final acceptance review, use `reviewer_strong`.
- Prefer concise status updates with:
  - touched files
  - key assumptions
  - risks
  - next action

## Implementation rules
- Do not rewrite working code just for style.
- Preserve existing architecture unless there is a clear reason to change it.
- When behavior changes, update or add tests.
- Call out uncertainty early instead of guessing.

## Delegation policy
- Use `explorer_fast` before editing when the task spans multiple files or the owning code path is unclear.
- Use `reviewer_strong` after meaningful changes to check correctness, regressions, and missing tests.
- When delegating, wait for the subagent result and then continue with one merged summary.

## Response format
- Be direct.
- Cite exact file paths and symbols when summarizing findings.
- Keep recommendations prioritized by risk.

## Preferred workflow
For bug fixes, bounded feature work, refactors, and test updates, prefer the `safe-change-workflow` skill.