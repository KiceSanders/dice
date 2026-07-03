# Architecture decision records (ADRs)

Lightweight log of **why** we built things a certain way. Use this when revisiting physics, 3D layout, or collider work so we do not re-litigate solved problems.

## Format

Each record is one markdown file:

```
docs/decisions/NNN-short-title.md
```

Template:

```markdown
# NNN. Title

**Status:** accepted | superseded | proposed  
**Date:** YYYY-MM-DD

## Context
What problem or constraint led to the decision?

## Decision
What we chose.

## Consequences
Tradeoffs, follow-ups, what we explicitly did *not* do.
```

- Keep records **short** (one screen). Link to code paths, not paste large snippets.
- When a decision is replaced, set status to `superseded` and point to the new ADR — do not delete old records.
- Add a new ADR when the choice is non-obvious, costly to reverse, or likely to confuse a future reader.

## Index

| ADR | Title |
|-----|-------|
| [001](./001-shared-geometry-physics-colliders.md) | Shared geometry for table and koozie physics colliders |
| [002](./002-rapier-physics-stack.md) | Rapier via `@react-three/rapier` for 3D dice |
