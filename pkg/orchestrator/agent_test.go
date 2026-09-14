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
	"strings"
	"testing"

	"github.com/go-steer/ephemeris/pkg/telemetry"
)

func TestAgent_GenerateFallback(t *testing.T) {
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
	if !strings.Contains(code, "template(container)") {
		t.Errorf("expected generated code to mount to container")
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
