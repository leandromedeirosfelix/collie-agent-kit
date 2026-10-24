---
name: collie-statistics
description: Use when the user wants to pool studies or run a meta-analysis in Collie, asks "OR or RR?", "fixed or random?", what I² or a prediction interval means, how to explore heterogeneity, whether to run Egger's test, subgroup or leave-one-out analyses, meta-regression or a Bayesian sensitivity analysis, or needs results written up — even if they just say "analyse my data". Chooses the effect measure and model a priori, runs everything through Collie's R engine (outcome_analyze / analysis_run), enforces the k gates and interprets the output.
---

# Statistics

Plans and runs the meta-analysis in R through Collie and interprets the results.

Before doing anything, call the `collie_guide` tool with name `collie-statistics` and follow the returned guide exactly.
If it fails, tell the user to connect Collie (`collie_connect`) and retry.
