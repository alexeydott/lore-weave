package api

import "testing"

func TestCanFinalizeEPUBImportWaitsForProcessingItem(t *testing.T) {
	if canFinalizeEPUBImport(0, 1, 0) {
		t.Fatal("finalize accepted an item that is still processing")
	}
	if canFinalizeEPUBImport(1, 0, 0) || canFinalizeEPUBImport(0, 0, 1) {
		t.Fatal("finalize accepted unfinished item state")
	}
	if !canFinalizeEPUBImport(0, 0, 0) {
		t.Fatal("finalize rejected a fully ready import")
	}
}
