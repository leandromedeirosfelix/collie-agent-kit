---
name: collie-rob-grade
description: Use when the user mentions risk of bias, RoB, RoB 2, ROBINS-I, QUADAS-2, QUIPS, Newcastle–Ottawa, quality assessment, bias domains, domain judgements, robvis plots, GRADE, certainty of evidence, downgrading, or a Summary of Findings table in a Collie review — even if they just ask "is this trial high quality?". Picks the tool by design, drafts domain judgements with quoted support (rob_assess, always draft), then proposes GRADE per outcome (grade_get / grade_set) for human confirmation.
---

# Risk of bias + GRADE

Drafts risk-of-bias assessments and GRADE certainty for human approval.

Before doing anything, call the `collie_guide` tool with name `collie-rob-grade` and follow the returned guide exactly.
If it fails, tell the user to connect Collie (`collie_connect`) and retry.
