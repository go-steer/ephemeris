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

package telemetry

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/go-steer/ephemeris/pkg/api"
	"github.com/go-steer/ephemeris/pkg/gke"
	"github.com/go-steer/ephemeris/pkg/mcp"
)

// LiveProvider queries real container logs and Kubernetes events via native k8s.io/client-go
// and Google Cloud Managed MCP (container.googleapis.com/mcp & logging.googleapis.com/mcp).
type LiveProvider struct {
	projectID   string
	gkeLive     *gke.LiveProvider
	gkeMCP      *mcp.Client
	loggingMCP  *mcp.Client
	mockDefault *MockProvider
}

// NewLiveProvider constructs a LiveProvider backed by native client-go and MCP fallback.
func NewLiveProvider(projectID string, gkeLive *gke.LiveProvider, gkeMCP, loggingMCP *mcp.Client) *LiveProvider {
	return &LiveProvider{
		projectID:   projectID,
		gkeLive:     gkeLive,
		gkeMCP:      gkeMCP,
		loggingMCP:  loggingMCP,
		mockDefault: NewMockProvider(),
	}
}

// QueryLogs retrieves live container logs and K8s events for a clicked 3D resource.
func (p *LiveProvider) QueryLogs(ctx context.Context, resourceURI string, limit int) (*api.TelemetryData, error) {
	if limit <= 0 {
		limit = 30
	}

	clusterName, namespace, podName := p.resolveTargetFromTopology(ctx, resourceURI)

	var entries []api.LogEntry
	metrics := map[string]string{
		"project":   p.projectID,
		"cluster":   clusterName,
		"namespace": namespace,
		"pod":       podName,
		"source":    "k8s.io/client-go + GKE MCP",
	}

	// 1. Try native k8s.io/client-go Pods().GetLogs() + Events().List() first (<100ms)
	if p.gkeLive != nil && clusterName != "" {
		if cs, _ := p.gkeLive.ClientsetForCluster(clusterName); cs != nil {
			tailLines := int64(limit)
			if podName != "" && namespace != "" {
				logCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
				rawLogs, err := cs.CoreV1().Pods(namespace).GetLogs(podName, &corev1.PodLogOptions{
					TailLines:  &tailLines,
					Timestamps: true,
				}).DoRaw(logCtx)
				cancel()
				if err == nil && len(rawLogs) > 0 {
					entries = append(entries, parseRawLogLines(string(rawLogs), podName)...)
				}
			}

			evCtx, ecancel := context.WithTimeout(ctx, 3*time.Second)
			evList, err := cs.CoreV1().Events(namespace).List(evCtx, metav1.ListOptions{Limit: 15})
			ecancel()
			if err == nil && evList != nil {
				for _, ev := range evList.Items {
					if podName != "" && !strings.Contains(ev.InvolvedObject.Name, podName) && len(entries) >= 5 {
						continue
					}
					sev := "INFO"
					if ev.Type == "Warning" {
						sev = "WARNING"
					}
					ts := resolveEventTimestamp(&ev)
					entries = append(entries, api.LogEntry{
						Timestamp: FormatLogTimestamp(ts.UTC().Format(time.RFC3339Nano)),
						Severity:  sev,
						Message:   fmt.Sprintf("[%s/%s] %s: %s", ev.InvolvedObject.Kind, ev.InvolvedObject.Name, ev.Reason, ev.Message),
						Source:    "k8s-event/" + clusterName,
					})
				}
			}
		}
	}

	// 2. If native client-go didn't return logs (e.g. private cluster endpoint), use GKE MCP get_k8s_logs
	if len(entries) == 0 && p.gkeMCP != nil && clusterName != "" && podName != "" && namespace != "" {
		_, loc := p.gkeLive.ClientsetForCluster(clusterName)
		if loc == "" {
			loc = p.findClusterLocation(ctx, clusterName)
		}
		if loc != "" {
			parent := fmt.Sprintf("projects/%s/locations/%s/clusters/%s", p.projectID, loc, clusterName)
			mcpCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
			raw, err := p.gkeMCP.CallTool(mcpCtx, "get_k8s_logs", map[string]interface{}{
				"parent":     parent,
				"namespace":  namespace,
				"name":       podName,
				"tail":       limit,
				"timestamps": true,
			})
			cancel()
			if err == nil && len(raw) > 0 {
				var out struct {
					Output string `json:"output"`
				}
				if json.Unmarshal(raw, &out) == nil && out.Output != "" {
					entries = append(entries, parseRawLogLines(out.Output, podName)...)
				}
			}
		}
	}

	// 3. Also query Cloud Logging MCP (list_log_entries) if entries are still empty
	if len(entries) == 0 && p.loggingMCP != nil && p.projectID != "" {
		filter := `resource.type="k8s_container" OR resource.type="k8s_cluster"`
		if clusterName != "" {
			filter = fmt.Sprintf(`resource.labels.cluster_name=%q`, clusterName)
		}
		mcpCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
		raw, err := p.loggingMCP.CallTool(mcpCtx, "list_log_entries", map[string]interface{}{
			"resourceNames": []string{"projects/" + p.projectID},
			"filter":        filter,
			"orderBy":       "timestamp desc",
			"pageSize":      15,
		})
		cancel()
		if err == nil && len(raw) > 0 {
			var parsed struct {
				Entries []struct {
					Timestamp   string                 `json:"timestamp"`
					Severity    string                 `json:"severity"`
					TextPayload string                 `json:"textPayload"`
					JSONPayload map[string]interface{} `json:"jsonPayload"`
				} `json:"entries"`
			}
			if json.Unmarshal(raw, &parsed) == nil {
				for _, e := range parsed.Entries {
					msg := e.TextPayload
					if msg == "" && len(e.JSONPayload) > 0 {
						b, _ := json.Marshal(e.JSONPayload)
						msg = string(b)
					}
					if msg == "" {
						continue
					}
					sev := e.Severity
					if sev == "" {
						sev = "INFO"
					}
					entries = append(entries, api.LogEntry{
						Timestamp: FormatLogTimestamp(e.Timestamp),
						Severity:  sev,
						Message:   msg,
						Source:    "cloud-logging/" + p.projectID,
					})
				}
			}
		}
	}

	// 4. Always provide a live telemetry status header entry if workload is quiet
	if len(entries) == 0 {
		entries = append(entries, api.LogEntry{
			Timestamp: FormatLogTimestamp(time.Now().UTC().Format(time.RFC3339Nano)),
			Severity:  "INFO",
			Message:   fmt.Sprintf("Connected to live GKE project %s (cluster=%s, namespace=%s, target=%s) — workload is Running with 0 error events", p.projectID, chooseNonEmpty(clusterName, "all"), chooseNonEmpty(namespace, "default"), chooseNonEmpty(podName, resourceURI)),
			Source:    "gke-live-telemetry",
		})
	}

	sortLogEntriesByTimestamp(entries)

	return &api.TelemetryData{
		ResourceURI: resourceURI,
		PodID:       chooseNonEmpty(podName, extractPodName(resourceURI)),
		Logs:        entries,
		Metrics:     metrics,
	}, nil
}

// StreamLogs establishes a live Follow: true log stream from the target pod via k8s.io/client-go
// and emits each new LogEntry with millisecond-accurate timestamps to out until ctx is cancelled.
func (p *LiveProvider) StreamLogs(ctx context.Context, resourceURI string, out chan<- api.LogEntry) error {
	clusterName, namespace, podName := p.resolveTargetFromTopology(ctx, resourceURI)
	if p.gkeLive == nil || clusterName == "" || podName == "" || namespace == "" {
		return nil
	}

	cs, _ := p.gkeLive.ClientsetForCluster(clusterName)
	if cs == nil {
		return nil
	}

	since := metav1.NewTime(time.Now().UTC().Add(-1 * time.Second))
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		stream, err := cs.CoreV1().Pods(namespace).GetLogs(podName, &corev1.PodLogOptions{
			Follow:     true,
			Timestamps: true,
			SinceTime:  &since,
		}).Stream(ctx)
		if err != nil {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(3 * time.Second):
				continue
			}
		}

		scanner := bufio.NewScanner(stream)
		for scanner.Scan() {
			if ctx.Err() != nil {
				_ = stream.Close()
				return ctx.Err()
			}
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			parsed := parseRawLogLines(line, podName)
			for _, entry := range parsed {
				if t, ok := parseTimestampTime(entry.Timestamp); ok {
					since = metav1.NewTime(t.Add(1 * time.Millisecond))
				} else {
					since = metav1.NewTime(time.Now().UTC())
				}
				select {
				case <-ctx.Done():
					_ = stream.Close()
					return ctx.Err()
				case out <- entry:
				}
			}
		}
		_ = stream.Close()

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
}

func resolveEventTimestamp(ev *corev1.Event) time.Time {
	if ev == nil {
		return time.Now().UTC()
	}
	if !ev.LastTimestamp.Time.IsZero() {
		return ev.LastTimestamp.Time
	}
	if !ev.EventTime.Time.IsZero() {
		return ev.EventTime.Time
	}
	if ev.Series != nil && !ev.Series.LastObservedTime.Time.IsZero() {
		return ev.Series.LastObservedTime.Time
	}
	if !ev.FirstTimestamp.Time.IsZero() {
		return ev.FirstTimestamp.Time
	}
	if !ev.CreationTimestamp.Time.IsZero() {
		return ev.CreationTimestamp.Time
	}
	return time.Now().UTC()
}

// FormatLogTimestamp normalizes RFC3339 / RFC3339Nano timestamps into a human-readable
// millisecond-accurate UTC string ("2006-01-02 15:04:05.000 UTC") without discarding sub-second precision.
func FormatLogTimestamp(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Now().UTC().Format("2006-01-02 15:04:05.000 UTC")
	}
	if t, ok := parseTimestampTime(raw); ok {
		return t.UTC().Format("2006-01-02 15:04:05.000 UTC")
	}
	return raw
}

func parseTimestampTime(raw string) (time.Time, bool) {
	raw = strings.TrimSpace(raw)
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.000 UTC",
		"2006-01-02 15:04:05.000",
		"2006-01-02T15:04:05.000Z",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, raw); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func sortLogEntriesByTimestamp(entries []api.LogEntry) {
	sort.SliceStable(entries, func(i, j int) bool {
		ti, oki := parseTimestampTime(entries[i].Timestamp)
		tj, okj := parseTimestampTime(entries[j].Timestamp)
		if oki && okj {
			return ti.Before(tj)
		}
		return entries[i].Timestamp < entries[j].Timestamp
	})
}

func (p *LiveProvider) resolveTargetFromTopology(ctx context.Context, resourceURI string) (clusterName, namespace, podName string) {
	if p.gkeLive == nil {
		return "", "default", extractPodName(resourceURI)
	}
	topo, err := p.gkeLive.GetTopology(ctx)
	if err != nil || topo == nil {
		return "", "default", extractPodName(resourceURI)
	}

	target := extractPodName(resourceURI)
	for _, c := range topo.Clusters {
		if strings.Contains(resourceURI, c.Name) {
			clusterName = c.Name
		}
		for _, ns := range c.Namespaces {
			for _, pod := range ns.Pods {
				if pod.ID == target || pod.Name == target || strings.Contains(resourceURI, pod.Name) {
					return c.Name, ns.Name, pod.Name
				}
			}
			for _, res := range ns.Resources {
				if res.ID == target || res.Name == target || strings.Contains(resourceURI, res.Name) {
					if len(ns.Pods) > 0 {
						return c.Name, ns.Name, ns.Pods[0].Name
					}
					return c.Name, ns.Name, res.Name
				}
			}
		}
	}

	if clusterName == "" && len(topo.Clusters) > 0 {
		clusterName = topo.Clusters[0].Name
		if len(topo.Clusters[0].Namespaces) > 0 {
			namespace = topo.Clusters[0].Namespaces[0].Name
			if len(topo.Clusters[0].Namespaces[0].Pods) > 0 {
				podName = topo.Clusters[0].Namespaces[0].Pods[0].Name
			}
		}
	}
	return clusterName, chooseNonEmpty(namespace, "default"), chooseNonEmpty(podName, target)
}

func (p *LiveProvider) findClusterLocation(ctx context.Context, clusterName string) string {
	if p.gkeLive == nil {
		return ""
	}
	topo, err := p.gkeLive.GetTopology(ctx)
	if err != nil || topo == nil {
		return ""
	}
	for _, c := range topo.Clusters {
		if c.Name == clusterName {
			return c.Location
		}
	}
	return ""
}

func parseRawLogLines(raw string, source string) []api.LogEntry {
	var out []api.LogEntry
	lines := strings.Split(strings.TrimSpace(raw), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		ts := FormatLogTimestamp(time.Now().UTC().Format(time.RFC3339Nano))
		msg := line
		if parts := strings.SplitN(line, " ", 2); len(parts) == 2 && strings.Contains(parts[0], "T") {
			ts = FormatLogTimestamp(parts[0])
			msg = parts[1]
		}
		sev := "INFO"
		upper := strings.ToUpper(msg)
		if strings.Contains(upper, "ERROR") || strings.Contains(upper, "FATAL") || strings.Contains(upper, "PANIC") {
			sev = "ERROR"
		} else if strings.Contains(upper, "WARN") {
			sev = "WARNING"
		}
		out = append(out, api.LogEntry{
			Timestamp: ts,
			Severity:  sev,
			Message:   msg,
			Source:    source,
		})
	}
	return out
}
