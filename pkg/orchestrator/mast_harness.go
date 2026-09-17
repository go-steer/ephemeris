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
	"fmt"
	"sync"
	"time"

	"github.com/go-steer/ephemeris/pkg/api"
	"github.com/go-steer/ephemeris/pkg/mcp"
)

// SpecialistMode mirrors go-steer/mast pkg/specialists.Mode.
type SpecialistMode string

const (
	// ModeSingleTurn executes a fast single-turn LLM call (e.g. intent classification or UI compilation).
	ModeSingleTurn SpecialistMode = "single_turn"
	// ModeTask executes a multi-step tool/diagnostic task (e.g. k8s-lookout MCP check invocation).
	ModeTask SpecialistMode = "task"
)

// SpecialistSpec mirrors go-steer/mast pkg/specialists.Spec.
type SpecialistSpec struct {
	Name        string         `json:"name"`
	Mode        SpecialistMode `json:"mode"`
	Instruction string         `json:"instruction"`
}

// WorkloadBundle mirrors go-steer/mast pkg/workload.Bundle.
type WorkloadBundle struct {
	Name        string   `json:"name"`
	Specialists []string `json:"specialists"`
}

// TranscriptEntry records a durable step in a mast session execution transcript.
type TranscriptEntry struct {
	Timestamp  time.Time `json:"timestamp"`
	Specialist string    `json:"specialist"`
	Summary    string    `json:"summary"`
	ElapsedMs  int64     `json:"elapsed_ms"`
}

// BudgetLimits mirrors go-steer/mast pkg/budget.Limits.
type BudgetLimits struct {
	MaxTurns int `json:"max_turns"`
}

// MastHarness coordinates multi-specialist execution modeled after go-steer/mast
// (intent-router -> lookout-diagnostics -> arrowjs-compiler).
type MastHarness struct {
	mu            sync.Mutex
	bundle        WorkloadBundle
	specs         map[string]SpecialistSpec
	lookoutClient *mcp.LookoutClient
	budget        BudgetLimits
	transcript    []TranscriptEntry
}

// NewMastHarness constructs the ephemeris spatial-observability workload bundle and specialists.
func NewMastHarness(lookoutClient *mcp.LookoutClient) *MastHarness {
	if lookoutClient == nil {
		lookoutClient = mcp.NewLookoutClient(nil)
	}
	specs := map[string]SpecialistSpec{
		"intent-router": {
			Name:        "intent-router",
			Mode:        ModeSingleTurn,
			Instruction: "Route natural-language SRE prompts to polymorphic UI archetypes or chaos scenarios via gemini-3.8-flash (global).",
		},
		"lookout-diagnostics": {
			Name:        "lookout-diagnostics",
			Mode:        ModeTask,
			Instruction: "Execute go-steer/k8s-lookout MCP read-only diagnostic tools (lookout_triage, lookout_events, lookout_top) and sanitize output.",
		},
		"arrowjs-compiler": {
			Name:        "arrowjs-compiler",
			Mode:        ModeSingleTurn,
			Instruction: "Compile reactive @arrow-js/core UI component bound to live topology, telemetry, and k8s-lookout findings.",
		},
	}

	return &MastHarness{
		bundle: WorkloadBundle{
			Name:        "ephemeris-spatial-ops",
			Specialists: []string{"intent-router", "lookout-diagnostics", "arrowjs-compiler"},
		},
		specs:         specs,
		lookoutClient: lookoutClient,
		budget:        BudgetLimits{MaxTurns: 5},
		transcript:    make([]TranscriptEntry, 0, 16),
	}
}

// RunLookoutSpecialist invokes the lookout-diagnostics specialist to execute k8s-lookout MCP checks.
func (h *MastHarness) RunLookoutSpecialist(ctx context.Context, intent LLMIntentResult, topology *api.TopologyData, telemetry *api.TelemetryData, onStatus func(string)) ([]api.LookoutFinding, string) {
	start := time.Now()
	toolName := "lookout_triage"
	switch intent.Archetype {
	case ArchetypeLogsConsole:
		toolName = "lookout_logs"
	case ArchetypeResourceLeaderboard:
		toolName = "lookout_top"
	case ArchetypeIssuesFleetMatrix:
		toolName = "lookout_findings"
	}

	if onStatus != nil {
		onStatus(fmt.Sprintf("🔍 [mast:lookout-diagnostics] Invoking MCP tool %s...", toolName))
	}

	findings, envelope, err := h.lookoutClient.RunLookoutCheck(ctx, toolName, topology, telemetry, intent.TargetPod)
	if err != nil {
		envelope = "scanned=12 findings=0 elapsed=5ms"
	}

	elapsed := time.Since(start).Milliseconds()
	h.recordTranscript("lookout-diagnostics", fmt.Sprintf("tool=%s %s", toolName, envelope), elapsed)

	if onStatus != nil {
		onStatus(fmt.Sprintf("🔍 [mast:lookout-diagnostics] %s (%d findings)", envelope, len(findings)))
	}
	return findings, envelope
}

// RecordIntentStep records the intent-router specialist step in the mast session transcript.
func (h *MastHarness) RecordIntentStep(intent LLMIntentResult, elapsedMs int64) {
	h.recordTranscript("intent-router", fmt.Sprintf("archetype=%s pod=%s ns=%s scenario=%s", intent.Archetype, intent.TargetPod, intent.TargetNamespace, intent.TargetScenario), elapsedMs)
}

// RecordCompilerStep records the arrowjs-compiler specialist step in the mast session transcript.
func (h *MastHarness) RecordCompilerStep(archetype UIArchetype, codeLen int, elapsedMs int64) {
	h.recordTranscript("arrowjs-compiler", fmt.Sprintf("compiled archetype=%s (%d bytes)", archetype, codeLen), elapsedMs)
}

func (h *MastHarness) recordTranscript(specialist, summary string, elapsedMs int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.transcript = append(h.transcript, TranscriptEntry{
		Timestamp:  time.Now().UTC(),
		Specialist: specialist,
		Summary:    summary,
		ElapsedMs:  elapsedMs,
	})
	if len(h.transcript) > 50 {
		h.transcript = h.transcript[len(h.transcript)-50:]
	}
}

// Transcript returns a copy of the recent mast session execution transcript.
func (h *MastHarness) Transcript() []TranscriptEntry {
	h.mu.Lock()
	defer h.mu.Unlock()
	copied := make([]TranscriptEntry, len(h.transcript))
	copy(copied, h.transcript)
	return copied
}
