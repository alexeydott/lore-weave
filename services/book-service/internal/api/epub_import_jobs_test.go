package api

import (
	"testing"

	"github.com/loreweave/epubimport"
)

func TestSelectEPUBImportItems_DefaultsToSelectedLeaves(t *testing.T) {
	roots := []*epubimport.NavigationNode{{
		SourceKey: "part", Title: "Part", Children: []*epubimport.NavigationNode{
			{SourceKey: "chapter-a", SourceHref: "a.xhtml", Selected: true},
			{SourceKey: "chapter-b", SourceHref: "b.xhtml", Selected: false},
		},
	}}

	selected, err := selectEPUBImportItems(roots, nil)
	if err != nil {
		t.Fatalf("selectEPUBImportItems() error = %v", err)
	}
	if len(selected) != 1 || !selected["chapter-a"] {
		t.Fatalf("selected = %#v, want chapter-a only", selected)
	}
}

func TestSelectEPUBImportItems_SelectsSubtree(t *testing.T) {
	roots := []*epubimport.NavigationNode{{
		SourceKey: "part", Title: "Part", Children: []*epubimport.NavigationNode{
			{SourceKey: "chapter-a", SourceHref: "a.xhtml"},
			{SourceKey: "chapter-b", SourceHref: "b.xhtml"},
		},
	}}

	selected, err := selectEPUBImportItems(roots, []string{"part"})
	if err != nil {
		t.Fatalf("selectEPUBImportItems() error = %v", err)
	}
	if len(selected) != 2 || !selected["chapter-a"] || !selected["chapter-b"] {
		t.Fatalf("selected = %#v, want both descendants", selected)
	}
}

func TestSelectEPUBImportItems_RejectsUnknownSelection(t *testing.T) {
	_, err := selectEPUBImportItems([]*epubimport.NavigationNode{{
		SourceKey: "chapter-a", SourceHref: "a.xhtml",
	}}, []string{"missing"})
	if err == nil {
		t.Fatal("selectEPUBImportItems() error = nil, want unknown source key error")
	}
}

func TestImportedLanguage(t *testing.T) {
	for _, tc := range []struct {
		input string
		want  string
	}{
		{input: "", want: "und"},
		{input: "auto", want: "und"},
		{input: "  ru  ", want: "ru"},
	} {
		if got := importedLanguage(tc.input); got != tc.want {
			t.Errorf("importedLanguage(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestNormalizeEPUBReportWarningPreservesDiagnosticContext(t *testing.T) {
	warning := normalizeEPUBReportWarning(map[string]any{
		"code":       "navigation_anchor_missing",
		"message":    "chapter start anchor is missing",
		"source_key": "chapter-1",
	}, "fallback", "")
	if warning["code"] != "navigation_anchor_missing" {
		t.Fatalf("code = %#v, want navigation_anchor_missing", warning["code"])
	}
	if warning["source_key"] != "chapter-1" {
		t.Fatalf("source_key = %#v, want chapter-1", warning["source_key"])
	}
}

func TestNormalizeEPUBReportWarningMakesRollbackConflictActionable(t *testing.T) {
	warning := normalizeEPUBReportWarning(map[string]any{
		"code": "rollback_conflict_user_modified",
	}, "", "")
	if warning["message"] == "EPUB import emitted a warning." {
		t.Fatal("rollback conflict did not receive an actionable message")
	}
}
