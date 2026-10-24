---
name: collie-search-strategy
description: Use when the user asks for a search string, search strategy, boolean query or MeSH terms for a Collie review, asks "why is my search missing X", wants to run or import a PubMed search, adapt a query to CENTRAL/Embase/Scopus/LILACS/ClinicalTrials.gov, do citation searching (references, citing articles, similar articles), or register a protocol (PROSPERO/INPLASY/OSF) — even if they just paste a messy query and ask to fix it. Builds, validates against known studies, imports and ports the search with the Collie search tools.
---

# Search strategy

Builds, validates and runs the literature search for a Collie review.

Before doing anything, call the `collie_guide` tool with name `collie-search-strategy` and follow the returned guide exactly.
If it fails, tell the user to connect Collie (`collie_connect`) and retry.
