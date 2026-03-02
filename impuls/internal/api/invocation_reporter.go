package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/oblak/impuls/internal/models"
)

type invocationReportPayload struct {
	FunctionName       string                 `json:"functionName"`
	Status             string                 `json:"status"`
	ProviderStatusCode int                    `json:"providerStatusCode"`
	ExecutionTimeMs    int64                  `json:"executionTimeMs,omitempty"`
	RuntimeLogs        *models.InvocationLogs `json:"runtimeLogs,omitempty"`
	Response           interface{}            `json:"response,omitempty"`
	ErrorMessage       string                 `json:"errorMessage,omitempty"`
	MemoryUsedMb       *int                   `json:"memoryUsedMb,omitempty"`
	Local              bool                   `json:"local"`
	InvokedAt          time.Time              `json:"invokedAt"`
}

type invocationReporter struct {
	url        string
	secret     string
	httpClient *http.Client
}

func newInvocationReporterFromEnv() *invocationReporter {
	url := strings.TrimSpace(os.Getenv("STRAPI_INVOCATION_REPORT_URL"))
	if url == "" {
		return nil
	}

	return &invocationReporter{
		url:    url,
		secret: strings.TrimSpace(os.Getenv("IMPULS_REPORT_SECRET")),
		httpClient: &http.Client{
			Timeout: 3 * time.Second,
		},
	}
}

func (r *invocationReporter) Send(payload invocationReportPayload) error {
	if r == nil {
		return nil
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal report: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, r.url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build report request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if r.secret != "" {
		req.Header.Set("X-Impuls-Report-Secret", r.secret)
	}

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("post report: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return errors.New("non-success report status")
	}

	return nil
}
