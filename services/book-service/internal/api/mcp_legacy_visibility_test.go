package api

// D-BOOK-TOOLS-REDESIGN drift-lock (docs/specs/2026-07-22-book-tools-redesign.md, CAT-4).
//
// The 9 lifecycle/destructive/priced book tools are deprecated to _meta.visibility:"legacy":
// kept REGISTERED (the HTTP endpoint + UI button keep working, existing/workflow callers keep
// working) but hidden from find_tools/hot-seed, so the AGENT can never create/delete/purge/
// publish a book or spend money unprompted. This test reds if anyone drops the
// WithVisibility(..., VisibilityLegacy) wrapper on any of them (the safety regression), or
// over-tags a kept content tool (the availability regression).

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	lwmcp "github.com/loreweave/loreweave_mcp"
)

var deprecatedBookTools = []string{
	// Part A — lifecycle / destructive / priced (agent must not create/delete/publish/bill).
	"book_create", "book_purge", "book_chapter_purge", "book_chapter_delete",
	"book_chapter_publish", "book_chapter_unpublish",
	"book_set_cover", "book_media_generate", "book_audio_generate",
	// Part C/D — reads superseded by the unified book_read (cat) + book_list (ls).
	"book_get", "book_get_chapter", "book_scene_get",
	"book_list_chapters", "book_list_revisions", "book_scene_list",
}

// keptContentTools — a spot-check that the redesign did NOT accidentally hide a tool the
// agent still needs (over-tagging is as much a bug as under-tagging). Includes the new
// unified reads (book_read = cat, book_list = ls) which MUST stay discoverable.
var keptContentTools = []string{
	"book_read", "book_list", "book_search",
	"book_chapter_save_draft", "book_chapter_create", "book_update_details",
}

func listBookToolMetas(t *testing.T) map[string]map[string]any {
	t.Helper()
	s := mcpTestServer(GrantOwner)
	srv := s.newMCPServer()
	ctx := context.Background()
	ct, st := mcp.NewInMemoryTransports()
	if _, err := srv.Connect(ctx, st, nil); err != nil {
		t.Fatalf("server connect: %v", err)
	}
	client := mcp.NewClient(&mcp.Implementation{Name: "book-legacy-drift", Version: "0"}, nil)
	cs, err := client.Connect(ctx, ct, nil)
	if err != nil {
		t.Fatalf("client connect: %v", err)
	}
	defer cs.Close()
	res, err := cs.ListTools(ctx, nil)
	if err != nil {
		t.Fatalf("ListTools: %v", err)
	}
	metas := make(map[string]map[string]any, len(res.Tools))
	for _, tl := range res.Tools {
		metas[tl.Name] = tl.Meta
	}
	return metas
}

func TestDeprecatedBookToolsAreLegacy(t *testing.T) {
	metas := listBookToolMetas(t)
	want := string(lwmcp.VisibilityLegacy)
	for _, name := range deprecatedBookTools {
		m, ok := metas[name]
		if !ok {
			t.Errorf("%s NOT registered — a deprecated tool must stay REGISTERED (endpoint/UI) as "+
				"visibility:legacy, never deleted", name)
			continue
		}
		if vis, _ := m[lwmcp.MetaKeyVisibility].(string); vis != want {
			t.Errorf("%s _meta.visibility=%q, want %q — the agent could still discover this "+
				"deprecated lifecycle/destructive/priced tool (CAT-4)", name, vis, want)
		}
	}
}

func TestKeptBookContentToolsAreNotLegacy(t *testing.T) {
	metas := listBookToolMetas(t)
	for _, name := range keptContentTools {
		m, ok := metas[name]
		if !ok {
			t.Errorf("%s missing — a kept content tool must stay registered + discoverable", name)
			continue
		}
		if vis, _ := m[lwmcp.MetaKeyVisibility].(string); vis == string(lwmcp.VisibilityLegacy) {
			t.Errorf("%s is tagged legacy but must stay discoverable — over-tagging hides a tool the "+
				"agent needs (docs/specs/2026-07-22-book-tools-redesign.md)", name)
		}
	}
}
