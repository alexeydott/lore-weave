# Implementation Plan: AI Scene Generation Assistant

Branch: main
Created: 2026-08-05

## Goal

Let an editor author select existing manuscript text, ask an AI model for structured scene proposals, review them, and explicitly create the selected scene outline nodes.

## Settings

- Testing: yes
- Logging: existing structured request/job logging
- Docs: yes

## Design decisions

- Reuse the existing composition selection-generation route and registered user model path, so model traffic remains mediated by provider-registry.
- Return a closed JSON schema from a dedicated selection operation; the editor never replaces manuscript text for this operation.
- Keep persistence explicit: the author selects proposals and applies them, which creates normal composition outline nodes under the current chapter.

## Tasks

- [x] Task 1: Add the `scene_plan` selection operation and its JSON-only prompt contract, with unit coverage.
- [x] Task 2: Add an editor selection-toolbar preview and explicit selected-proposal apply flow, with UI coverage.
- [x] Task 3: Run focused backend/frontend regressions and document the new editor capability in the feature index. Evidence: frontend SelectionToolbar suite (6 passed), frontend type/build passed, and a deliberate missing-control mutation made the new UI test fail before restoration. The host Python interpreter has no pytest; syntax compilation passed and the service test suite remains deferred to its provisioned environment.
