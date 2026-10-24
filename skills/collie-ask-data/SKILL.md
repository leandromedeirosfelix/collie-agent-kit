---
name: collie-ask-data
description: Use when the user asks a question across the articles of a Collie review (which studies report X, compare outcomes, find the most relevant studies, summarise evidence) — answers strictly from the review's references with citations and 0–1 relevance scores.
---

# Ask your data (Collie)

Answers questions across the articles of a Collie review, citing only the review's references.

Before doing anything, call the `collie_guide` tool with name `collie-ask-data` and follow the returned guide exactly.
If it fails, tell the user to connect Collie (`collie_connect`) and retry.
