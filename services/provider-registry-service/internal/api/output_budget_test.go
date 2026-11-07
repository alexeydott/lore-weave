package api

import "testing"

func TestMaxOutputFromContext(t *testing.T) {
	cases := []struct {
		name string
		ctx  int
		want int
	}{
		{"invalid context derives nothing", 0, 0},
		{"negative context derives nothing", -8, 0},
		{"4k window floors at 1024", 4096, 1024},
		{"8k window gets a quarter", 8192, 2048},
		{"16k window gets a quarter", 16384, 4096},
		{"32k window gets a quarter", 32768, 8192},
		{"128k window caps at the composition ceiling", 131072, 32768},
		{"1M window still caps", 1000000, 32768},
		{"non-multiple floors keep the quarter rounding", 10000, 2500},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := MaxOutputFromContext(tc.ctx); got != tc.want {
				t.Fatalf("MaxOutputFromContext(%d) = %d, want %d", tc.ctx, got, tc.want)
			}
		})
	}
}
