---
name: collie-ai-extraction
description: Use when asked to extract data from articles in a Collie review — study characteristics, population, interventions, outcomes, funding, Table 1 baseline characteristics, arm-level events/means/SDs for meta-analysis — or asks how to convert a median/IQR, range, SE or CI to mean/SD, merge two arms, or prepare outcome data for a forest plot. Fills the review's extraction questions with verbatim-quoted answers and outcome data with page-level sources, all for human approval; never imputes.
---

# Collie AI extraction

Drafts data extraction (custom questions, Table 1, outcome data) from included articles for human approval.

Before doing anything, call the `collie_guide` tool with name `collie-ai-extraction` and follow the returned guide exactly.
If it fails, tell the user to connect Collie (`collie_connect`) and retry.
