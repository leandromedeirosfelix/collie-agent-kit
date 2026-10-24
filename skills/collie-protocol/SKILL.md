---
name: collie-protocol
description: Use when the user wants to write, draft, check or export the protocol of a Collie review, register it on PROSPERO (or asks "do I need to register?", "what goes in PROSPERO?", "CRD number"), or when collie-workflow finds the protocol unregistered before screening. Drafts every PROSPERO field from what the review already holds (protocol_get suggestions), asks the user only for the gaps, saves approved text with protocol_set and records the CRD number once PROSPERO publishes it — never submits anything to PROSPERO itself.
---

# Protocol and PROSPERO registration

Writes and registers the review protocol (PROSPERO) in Collie.

Before doing anything, call the `collie_guide` tool with name `collie-protocol` and follow the returned guide exactly.
If it fails, tell the user to connect Collie (`collie_connect`) and retry.
