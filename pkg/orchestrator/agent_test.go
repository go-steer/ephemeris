// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package orchestrator

import (
	"context"
	"regexp"
	"strings"
	"testing"

	"github.com/go-steer/ephemeris/pkg/telemetry"
)

func TestAgent_GenerateFallback_Crashing(t *testing.T) {
	ctx := context.Background()
	agent := NewAgent(ctx, AgentConfig{
		Model:     "gemini-3.8-flash",
		ForceMock: true,
	})

	telemProvider := telemetry.NewMockProvider()
	telemData, err := telemProvider.QueryLogs(ctx, "gke://production/payment-service", 10)
	if err != nil {
		t.Fatalf("QueryLogs failed: %v", err)
	}

	code, err := agent.GenerateUI(ctx, "Why is this crashing?", telemData)
	if err != nil {
		t.Fatalf("GenerateUI failed: %v", err)
	}

	if !strings.Contains(code, "reactive") {
		t.Errorf("expected generated code to use ArrowJS 'reactive'")
	}
	if !strings.Contains(code, "html`") {
		t.Errorf("expected generated code to use ArrowJS 'html'")
	}
	if !strings.Contains(code, "Rollback") {
		t.Errorf("expected crashing workload code to contain Rollback action")
	}
	assertNoPartialAttributeInterpolation(t, code)
}

func TestAgent_GenerateFallback_Healthy(t *testing.T) {
	ctx := context.Background()
	agent := NewAgent(ctx, AgentConfig{
		Model:     "gemini-3.8-flash",
		ForceMock: true,
	})

	telemProvider := telemetry.NewMockProvider()
	telemData, err := telemProvider.QueryLogs(ctx, "gke://production/frontend", 10)
	if err != nil {
		t.Fatalf("QueryLogs failed: %v", err)
	}

	code, err := agent.GenerateUI(ctx, "Show status of frontend", telemData)
	if err != nil {
		t.Fatalf("GenerateUI failed: %v", err)
	}

	if !strings.Contains(code, "Service Health & Telemetry") {
		t.Errorf("expected healthy workload to render Service Health & Telemetry tab")
	}
	if strings.Contains(code, "Rollback") {
		t.Errorf("healthy workload should not offer rollback remediation")
	}
	if strings.Contains(code, "Panic") {
		t.Errorf("healthy workload should not report runtime panic")
	}
	assertNoPartialAttributeInterpolation(t, code)
}

func TestAgent_GenerateFallback_Pending(t *testing.T) {
	ctx := context.Background()
	agent := NewAgent(ctx, AgentConfig{
		Model:     "gemini-3.8-flash",
		ForceMock: true,
	})

	telemProvider := telemetry.NewMockProvider()
	telemData, err := telemProvider.QueryLogs(ctx, "gke://staging/batch-ingestor", 10)
	if err != nil {
		t.Fatalf("QueryLogs failed: %v", err)
	}

	code, err := agent.GenerateUI(ctx, "Inspect batch-ingestor", telemData)
	if err != nil {
		t.Fatalf("GenerateUI failed: %v", err)
	}

	if !strings.Contains(code, "Scheduling Diagnostics") {
		t.Errorf("expected pending workload to render Scheduling Diagnostics tab")
	}
	if !strings.Contains(code, "Autoscaler") {
		t.Errorf("expected pending workload to display autoscaler status")
	}
	if strings.Contains(code, "Rollback") {
		t.Errorf("pending workload should not offer rollback remediation")
	}
	assertNoPartialAttributeInterpolation(t, code)
}

func assertNoPartialAttributeInterpolation(t *testing.T, code string) {
	t.Helper()
	reAttr := regexp.MustCompile(`[a-zA-Z0-9_\-]+="([^"]*)"`)
	for _, match := range reAttr.FindAllStringSubmatch(code, -1) {
		val := match[1]
		if strings.Contains(val, "${") {
			if !strings.HasPrefix(val, "${") || !strings.HasSuffix(val, "}") || strings.Count(val, "${") > 1 {
				t.Errorf("found forbidden partial attribute interpolation in %q: %q (causes ArrowJS 'Invalid HTML position')", match[0], val)
			}
		}
	}
}

func TestSanitizeCode(t *testing.T) {
	raw := "```javascript\nconst a = 1;\n```"
	sanitized := SanitizeCode(raw)
	if sanitized != "const a = 1;" {
		t.Errorf("expected 'const a = 1;', got %q", sanitized)
	}

	rawJS := "```js\nlet b = 2;\n```"
	sanitizedJS := SanitizeCode(rawJS)
	if sanitizedJS != "let b = 2;" {
		t.Errorf("expected 'let b = 2;', got %q", sanitizedJS)
	}
}

func TestAgent_GenerateStream_StatusCallbacks(t *testing.T) {
	ctx := context.Background()
	agent := NewAgent(ctx, AgentConfig{
		Model:     "gemini-3.8-flash",
		ForceMock: true,
	})

	telemProvider := telemetry.NewMockProvider()
	telemData, err := telemProvider.QueryLogs(ctx, "gke://production/payment-service", 10)
	if err != nil {
		t.Fatalf("QueryLogs failed: %v", err)
	}

	var statusMessages []string
	code, err := agent.GenerateStream(ctx, "Diagnose crash", telemData, func(msg string) {
		statusMessages = append(statusMessages, msg)
	})
	if err != nil {
		t.Fatalf("GenerateStream failed: %v", err)
	}
	if len(code) == 0 {
		t.Fatal("expected non-empty code from GenerateStream")
	}
	if len(statusMessages) == 0 {
		t.Fatal("expected at least one status callback message")
	}
	if !strings.Contains(statusMessages[0], "panic trace") {
		t.Errorf("expected panic trace analysis status, got %q", statusMessages[0])
	}
}

func TestAgent_PolymorphicArchetypes(t *testing.T) {
	ctx := context.Background()
	agent := NewAgent(ctx, AgentConfig{
		Model:     "gemini-3.8-flash",
		ForceMock: true,
	})

	telemProvider := telemetry.NewMockProvider()
	telemData, err := telemProvider.QueryLogs(ctx, "gke://production/payment-service", 10)
	if err != nil {
		t.Fatalf("QueryLogs failed: %v", err)
	}

	cases := []struct {
		name             string
		prompt           string
		expectedType     UIArchetype
		expectedContains string
	}{
		{
			name:             "logs_console",
			prompt:           "show me the logs for payment-service",
			expectedType:     ArchetypeLogsConsole,
			expectedContains: "Live Log Console",
		},
		{
			name:             "issues_matrix",
			prompt:           "show me the list of pods with issues",
			expectedType:     ArchetypeIssuesFleetMatrix,
			expectedContains: "Multi-Cluster Incident Fleet Matrix",
		},
		{
			name:             "which_pods_have_issues",
			prompt:           "which pods have issues",
			expectedType:     ArchetypeIssuesFleetMatrix,
			expectedContains: "Multi-Cluster Incident Fleet Matrix",
		},
		{
			name:             "namespace_inventory",
			prompt:           "show me all the pods in the default namespace",
			expectedType:     ArchetypeNamespaceInventory,
			expectedContains: "Namespace Workload Inventory",
		},
		{
			name:             "resource_leaderboard",
			prompt:           "compare memory usage across pods",
			expectedType:     ArchetypeResourceLeaderboard,
			expectedContains: "Workload Resource Saturation Leaderboard",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotType, _ := classifyPromptArchetype(tc.prompt, telemData)
			if gotType != tc.expectedType {
				t.Errorf("classifyPromptArchetype(%q) = %v, expected %v", tc.prompt, gotType, tc.expectedType)
			}

			var statusMsgs []string
			code, err := agent.GenerateStream(ctx, tc.prompt, telemData, func(msg string) {
				statusMsgs = append(statusMsgs, msg)
			})
			if err != nil {
				t.Fatalf("GenerateStream failed for %q: %v", tc.prompt, err)
			}
			if !strings.Contains(code, tc.expectedContains) {
				t.Errorf("expected generated code for %q to contain %q", tc.prompt, tc.expectedContains)
			}
			assertNoPartialAttributeInterpolation(t, code)
		})
	}
}
