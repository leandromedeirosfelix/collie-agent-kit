---
name: collie-ai-reviewer
description: Use when asked to screen, triage or pre-screen references in a Collie systematic review (title/abstract or full text), check full-text eligibility, handle overlapping reports, summarise screening conflicts or reconcile PRISMA flow counts — screens the whole queue automatically against the review's own inclusion/exclusion criteria, writing Include / Maybe / Exclude suggestions with justification notes (Maybe only for genuine doubt), never final decisions.
---

# Collie AI Reviewer

Runs AI-assisted title/abstract and full-text screening suggestions for a Collie review; humans make the final decisions.

Before doing anything, call the `collie_guide` tool with name `collie-ai-reviewer` and follow the returned guide exactly.
If it fails, tell the user to connect Collie (`collie_connect`) and retry.
