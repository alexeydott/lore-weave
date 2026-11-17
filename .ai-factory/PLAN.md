# Implementation Plan: FB2 Book Import

Branch: main
Created: 2026-08-02

## Original Request
запланируй и реализуй поддержку импорта книг в формате fb2 - с сохранением структуры и метаданных книги. два режима работы: импорт в новую книгу (создается книга , создаются главы, импортируются главы (по возможности с сохранением названий, импортируются мемаданные - картинка, описание итд) второй режим - это когда книга уже есть и в нее нужно импортировать главы из файла fb2 . схемы fb2 доступны по адресу: https://www.beroal.in.ua/human/fiction_book/ скачай наиболее актуальные и сохрани их в репозитории локально. попробуй актуализировать их до версии 2.2. подумай как лучше реализовать такой инструмент / сервис .

## Settings

- Testing: yes
- Logging: verbose
- Docs: yes

## Roadmap Linkage

Milestone: "none"
Rationale: "No active roadmap item governs FB2 import."

## Design Decisions

- Parse FB2 in `worker-infra`, beside the EPUB structural adapter, rather than through Pandoc. This preserves the source section tree, titles, inline semantics, and embedded binaries before the existing HTML-to-parse-to-chapter pipeline.
- Keep the current `POST /v1/books/{book_id}/import` as the existing-book mode. Add a book-service-owned create-and-import endpoint for the new-book mode; it creates the target book and the queued job atomically before worker processing.
- Copy FB2 2.2 XSD dependencies into `contracts/schemas/fb2/2.2/` with provenance and checksums. They document and support compatibility review; the Go runtime uses a bounded structural parser because the project has no XSD validation runtime.
- Persist source metadata in a book-service-owned JSONB record while projecting safe user-visible fields to `books` (title, description, language, genres) and storing an FB2 cover through the existing cover-asset table. Existing-book imports retain existing user-authored book metadata by default; the source metadata is still retained with the import.

## Commit Plan

- **Commit 1** (after tasks 1-3): `feat(import): add FB2 parsing and contracts`
- **Commit 2** (after tasks 4-6): `feat(import): support FB2 new-book imports`

## Tasks

### Phase 1: Contracts and parser

- [x] Task 1: Vendor the upstream FictionBook 2.2 XML schemas with a provenance manifest and update the books OpenAPI contract for FB2 existing-book and create-book import modes. Files: `contracts/schemas/fb2/2.2/*`, `contracts/api/books/v1/openapi.yaml`. Logging: no runtime logs; preserve source URL, retrieval date, SHA-256, and license notice in the manifest. Depends on: none.
- [x] Task 2: Implement a bounded FB2 structural adapter that validates the supported FictionBook root/namespace, retains hierarchy and titles as HTML headings, converts supported prose markup, and materializes only safe embedded image data URIs. Files: `services/worker-infra/internal/tasks/fb2_structure.go`, tests/fixtures. Logging: structured DEBUG/INFO for parse entry, selected body, section/image counts; WARN for skipped invalid/non-image resources; never log manuscript text or binary data. Depends on: Task 1.
- [x] Task 3: Route `fb2` through the asynchronous importer, preserve the source filename extension, upload embedded chapter images, and update book metadata/cover only for create-mode jobs while recording import metadata for both modes. Files: `services/worker-infra/internal/tasks/import_processor.go`, migration, book-service import APIs. Logging: INFO at state changes with job/book IDs and counts, WARN for non-fatal cover/image omission, ERROR with operation context; never log source content. Depends on: Task 2.

### Phase 2: Public modes and clients

- [x] Task 4: Add the book-service new-book FB2 endpoint, shared transactional job creation, metadata ownership fields, and authentication/tenant enforcement; add the existing-book FB2 allowlist. Files: `services/book-service/internal/api/import.go`, `server.go`, `internal/migrate/migrate.go`, API tests. Logging: structured INFO for create/queue, WARN for rejected metadata application, ERROR for storage/database failures, with IDs only. Depends on: Task 3 design contract.
- [x] Task 5: Expose both modes in the existing frontend import UI and API client, including `.fb2` selection and explicit destination choice without duplicating client-side parsing. Files: `frontend/src/components/import/ImportDialog.tsx`, `frontend/src/features/books/api.ts`, relevant types/tests. Logging: use existing UI error instrumentation; do not log file content. Depends on: Task 4.

### Phase 3: Regression evidence and documentation

- [x] Task 6: Add non-vacuous parser, contract, and integration regressions for metadata projection, existing-book metadata preservation, new-book creation, chapter hierarchy/order, inline image extraction, malformed XML, and size limits; update the owned API/import documentation and session handoff with evidence. Files: worker/book-service/frontend tests, `docs/specs/` or authoritative import docs, `docs/sessions/SESSION_HANDOFF.md`. Logging: tests must assert observable output and error classifications; fixtures contain only synthetic text. Depends on: Tasks 1-5.
