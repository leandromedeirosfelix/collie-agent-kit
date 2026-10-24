---
name: collie-workflow
description: Use when the user wants to start, resume, plan or check the status of a systematic review or meta-analysis in Collie ("SR/MA", evidence synthesis, PRISMA project, "what's next on my review"), gives a clinical question to turn into a publishable meta-analysis, or names one stage (search, screening, extraction, forest plot, GRADE, manuscript) without saying where the review stands. Orchestrates the whole pipeline — question → viability → protocol (PROSPERO) → search → screening → full text → extraction → risk of bias → analysis → GRADE → PRISMA checklist → manuscript → submission — reading the review state through the Collie tools and routing to the right collie-* skill and agent.
---

# Collie workflow (orchestrator)

Orchestrates a whole systematic review / meta-analysis in Collie and routes to the right collie-* skill.

Before doing anything, call the `collie_guide` tool with name `collie-workflow` and follow the returned guide exactly.
If it fails, tell the user to connect Collie (`collie_connect`) and retry.
