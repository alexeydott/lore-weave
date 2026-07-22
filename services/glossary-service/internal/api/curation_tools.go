package api

// Catalog-unification 2026-07-22, Part B — glossary_curation_list.
//
// The three curation-inbox READS (list_merge_candidates / list_unknown_entities /
// list_ai_suggestions) were near-identical in shape — "list this book's <inbox>, filtered
// by status" — so a mid-tier model juggling all three (plus 40 other tools) mis-picks and
// re-reads the catalog. This UNIFIES them behind ONE tool with a closed-set `view` enum
// (the discriminator a weak model can actually pick, per mcp-tool-io.md CAT / the panel_id
// bug). Each view REUSES the exact same core the legacy tool + the HTTP handler use
// (loadMergeCandidates / queryUnknownEntities / queryAISuggestions) — single source of
// truth, no query re-implemented. The 3 legacy tools stay registered (visibility:legacy)
// for existing callers.
//
// The entity-addressed detail reads (chapter_links / revisions / evidence / genres) fold
// into glossary_get_entity via `include` instead (D1) — they are NOT views here, because
// they key on an entity, not a book inbox.

import (
	"context"
	"errors"
	"strings"

	"github.com/loreweave/grantclient"
	lwmcp "github.com/loreweave/loreweave_mcp"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// RegisterCurationTools adds glossary_curation_list to the user/book /mcp server
// (append-only convention, matches the other Register*Tools).
func (s *Server) RegisterCurationTools(srv *mcp.Server) {
	lwmcp.RegisterTool(srv, &mcp.Tool{
		Name: "glossary_curation_list",
		Description: "List a book's CURATION inbox — the review queues an assistant triages. Pick ONE `view`:\n" +
			"  • merge_candidates — duplicate-entity clusters the system detected (each with members, " +
			"suggested winner, score, rationale). status: proposed (default) | dismissed | merged.\n" +
			"  • unknowns — extracted entities whose kind couldn't be determined (the triage bucket, with " +
			"the extractor's guessed source kind). status: draft (default, pending) | active | inactive | " +
			"rejected | all.\n" +
			"  • ai_suggestions — AI-suggested entity drafts awaiting review. status: draft (default, " +
			"pending) | active | inactive | rejected | all.\n" +
			"Returns {view, items, total?, truncated?}. Read the relevant view BEFORE proposing a curation " +
			"action (glossary_propose_curation). Omit `status` for the view's sensible default; do not send " +
			"an empty string. book_id is optional inside a book studio (the current book is used).",
		InputSchema: closedSetSchemaFor[curationListToolIn](map[string][]any{
			"view":   {"merge_candidates", "unknowns", "ai_suggestions"},
			"status": {"proposed", "dismissed", "merged", "draft", "active", "inactive", "rejected", "all"},
		}),
		Meta: lwmcp.WithAmbientBook(lwmcp.NewToolMeta(lwmcp.TierR, lwmcp.ScopeBook, nil, []string{
			"review inbox", "curation inbox", "duplicates to merge", "triage unknown entities",
			"ai suggestions to review", "what needs review", "entity review queue",
		})),
	}, s.toolCurationList)
}

type curationListToolIn struct {
	// book_id OPTIONAL (ambient_book) — omitted inside a book studio, resolves from the envelope (X-Book-Id).
	BookID string `json:"book_id,omitempty" jsonschema:"the book (UUID). Omit inside a book studio — the current book is used."`
	View   string `json:"view" jsonschema:"which curation inbox to list: merge_candidates | unknowns | ai_suggestions"`
	Status string `json:"status,omitempty" jsonschema:"optional status filter (view-dependent — see the tool description); omit for the view's default, do not send an empty string"`
}

// curationListOut is a discriminated union keyed by `view`: Items holds the view's native
// rows ([]mergeCandidateView | []unknownEntityOut | []aiSuggestionItem). Total is set for
// the inbox views (which under-report via LIMIT); Truncated for merge_candidates (capped
// post-query, signalled — never silent).
type curationListOut struct {
	View      string `json:"view"`
	Items     any    `json:"items"`
	Total     int    `json:"total,omitempty"`
	Truncated bool   `json:"truncated,omitempty"`
}

func (s *Server) toolCurationList(ctx context.Context, _ *mcp.CallToolRequest, in curationListToolIn) (*mcp.CallToolResult, curationListOut, error) {
	_, bookID, err := s.bookToolAuthAmbient(ctx, in.BookID, grantclient.GrantView)
	if err != nil {
		return nil, curationListOut{}, err
	}
	switch strings.TrimSpace(in.View) {
	case "merge_candidates":
		status := strings.TrimSpace(in.Status)
		if status == "" {
			status = "proposed"
		}
		if status != "proposed" && status != "dismissed" && status != "merged" {
			return nil, curationListOut{}, errors.New("for view=merge_candidates, status must be proposed, dismissed, or merged")
		}
		cands, err := s.loadMergeCandidates(ctx, bookID, status, 0) // full set; cap after, signal it
		if err != nil {
			return nil, curationListOut{}, errors.New("failed to load merge candidates")
		}
		truncated := false
		if len(cands) > pipelineReadCap {
			cands = cands[:pipelineReadCap]
			truncated = true
		}
		return nil, curationListOut{View: "merge_candidates", Items: cands, Truncated: truncated}, nil

	case "unknowns":
		status, err := resolveInboxStatusFilter(in.Status)
		if err != nil {
			return nil, curationListOut{}, err
		}
		items, total, err := s.queryUnknownEntities(ctx, bookID, status)
		if err != nil {
			return nil, curationListOut{}, errors.New("failed to load unknown entities")
		}
		return nil, curationListOut{View: "unknowns", Items: items, Total: total}, nil

	case "ai_suggestions":
		status, err := resolveInboxStatusFilter(in.Status)
		if err != nil {
			return nil, curationListOut{}, err
		}
		items, total, err := s.queryAISuggestions(ctx, bookID, status)
		if err != nil {
			return nil, curationListOut{}, errors.New("failed to load AI suggestions")
		}
		return nil, curationListOut{View: "ai_suggestions", Items: items, Total: total}, nil

	default:
		return nil, curationListOut{}, errors.New("view must be merge_candidates, unknowns, or ai_suggestions")
	}
}
