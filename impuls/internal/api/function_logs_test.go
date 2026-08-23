package api

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"

	"github.com/oblak/impuls/internal/models"
)

// captureServer returns a server whose logger writes JSON lines to buf, so a
// test can assert exactly what reached the telemetry pipeline.
func captureServer(buf *bytes.Buffer) *Server {
	return &Server{
		logger: slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelInfo})),
	}
}

func decodeLines(t *testing.T, buf *bytes.Buffer) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if line == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			t.Fatalf("bad log line %q: %v", line, err)
		}
		out = append(out, m)
	}
	return out
}

func TestEmitFunctionLogsStdoutStderrAndError(t *testing.T) {
	var buf bytes.Buffer
	s := captureServer(&buf)

	logs := &models.InvocationLogs{
		Stdout: []string{"starting up", "", "processed 3 items"},
		Stderr: []string{"deprecation warning"},
	}
	s.emitFunctionLogs(context.Background(), "orders-fn", false, logs, "TypeError: x is not a function", 42)

	lines := decodeLines(t, &buf)
	// 2 stdout (the empty one is skipped) + 1 stderr + 1 error = 4
	if len(lines) != 4 {
		t.Fatalf("expected 4 records, got %d: %s", len(lines), buf.String())
	}

	var info, warn, errc int
	for _, l := range lines {
		if l["faas.name"] != "orders-fn" {
			t.Errorf("record missing faas.name: %v", l)
		}
		switch l["level"] {
		case "INFO":
			info++
			if l["faas.stream"] != "stdout" {
				t.Errorf("INFO record should be stdout: %v", l)
			}
		case "WARN":
			warn++
			if l["faas.stream"] != "stderr" {
				t.Errorf("WARN record should be stderr: %v", l)
			}
		case "ERROR":
			errc++
			if !strings.Contains(l["error"].(string), "TypeError") {
				t.Errorf("ERROR record missing the thrown message: %v", l)
			}
		}
	}
	if info != 2 || warn != 1 || errc != 1 {
		t.Errorf("levels: info=%d warn=%d error=%d, want 2/1/1", info, warn, errc)
	}
}

func TestEmitFunctionLogsSuccessHasNoError(t *testing.T) {
	var buf bytes.Buffer
	s := captureServer(&buf)
	s.emitFunctionLogs(context.Background(), "fn", false, &models.InvocationLogs{Stdout: []string{"ok"}}, "", 5)

	lines := decodeLines(t, &buf)
	if len(lines) != 1 || lines[0]["level"] != "INFO" {
		t.Fatalf("expected a single INFO record, got %s", buf.String())
	}
}

func TestEmitFunctionLogsNilLoggerIsSafe(t *testing.T) {
	// A server without telemetry (as the other unit tests run) must not panic.
	s := &Server{}
	s.emitFunctionLogs(context.Background(), "fn", true, &models.InvocationLogs{Stdout: []string{"x"}}, "boom", 1)
}
