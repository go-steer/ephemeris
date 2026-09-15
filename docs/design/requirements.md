
# Product Requirements Document (PRD): Ephemeral Cloud Ops

## 1. Executive Summary & Product Vision

**Product Vision:** A generative spatial observability platform that replaces static dashboards with a live 3D topological mesh, utilizing LLM agents to generate ephemeral, task-specific control interfaces precisely at the moment of a cloud infrastructure incident.

The modern enterprise cloud has outgrown the static dashboard. **Ephemeral Cloud Ops** aims to eliminate "dashboard rot" and cognitive overload for Site Reliability Engineers (SREs). By combining a WebGL spatial canvas with ArrowJS generative UI sandboxes and a Go-based orchestration backend (`go-steer`), the platform shifts the observability paradigm from "predicting what data we might need" to "generating the exact interface we need, exactly when we need it, and destroying it when we are done."

## 2. The Problem Statement

In 2026, the average mid-to-large enterprise loses between $300,000 and $1,000,000 per hour of unplanned IT downtime. While organizations invest heavily in gathering telemetry (metrics, logs, traces), the bottleneck in incident mitigation is human cognitive overload.

During a Sev-1 outage, SREs must mentally map multi-dimensional Kubernetes architectures using flat, disconnected 2D dashboards. This paradigm suffers from two fatal flaws:

1. **Dashboard Rot:** Pre-built dashboards routinely become obsolete as declarative infrastructure shifts, forcing engineers to write ad-hoc queries mid-outage.
2. **Spatial Blindness:** A flat list of alerts cannot communicate the physical "blast radius" or network dependency chain of an anomaly.

## 3. Target Personas

### Primary User: The SRE Lead (Incident Commander)

* **Focus:** Keeping production systems running, minimizing Mean Time to Resolve (MTTR), and maintaining Service Level Objectives (SLOs).
* **Pain Points:**
* *Context Switching:* Must open 10+ browser tabs across logging, APM, and cloud consoles just to understand what is failing.
* *Alert Fatigue:* Flooded with cascading alerts where a single root cause triggers hundreds of downstream pod failure notifications.


* **The Solution:** When an alert fires, the 3D topology map automatically centers on the failing node. An agent instantly generates a custom ArrowJS control panel containing live log tails and mitigation controls. No hunting for the right dashboard.

### Economic Buyer: The VP of Platform Engineering

* **Focus:** Developer velocity, cloud cost optimization, enterprise security compliance, and platform reliability.
* **Pain Points:**
* *Runaway Observability Costs:* Paying exorbitant ingest fees for APM tools while engineers still complain they cannot find data.
* *Security Risk:* Reluctant to give AI tools read/write access to production environments out of fear of hallucinations.


* **The Solution:** The architecture relies on Google Cloud's Managed MCP servers utilizing standard Application Default Credentials (ADC). The AI agent inherits the exact IAM permissions of the logged-in user, mathematically preventing unauthorized production access while directly attacking the $300K/hour downtime metric.

## 4. Competitive Landscape

The current generation of tools treats AI primarily as a chat interface layered over existing, rigid dashboards. Ephemeral Cloud Ops abandons the static dashboard entirely in favor of an **Agent-Generated Spatial Interface**.

| Feature / Capability | Ephemeral Cloud Ops (Our Platform) | Datadog (Bits AI) | Dynatrace (Davis CoPilot) | Google Cloud (Gemini Cloud Assist) |
| --- | --- | --- | --- | --- |
| **Core UI Paradigm** | **3D Spatial + Ephemeral UIs.** Generates temporary WebGL/ArrowJS panels on the fly. | **Chat + Static Dashboards.** Retrieves logs and points to existing dashboards. | **Chat + Notebooks.** Generates DQL queries and embeds them in notebooks. | **Chat + Console.** Summarizes logs and guides users through standard GCP UI. |
| **Topology** | **True 3D Blast Radius.** WebGL visualizes live GKE mesh dependencies interactively. | **2D Service Maps.** APM service maps are static, 2D network graphs. | **Smartscape.** Good dependency mapping, but UI is traditional 2D. | **IaC Diagrams.** Generates architecture diagrams, but not live 3D telemetry. |
| **Generative Action** | **Interactive UI Generation.** AI writes functional ArrowJS widgets (e.g., traffic drain sliders). | **Fix Suggestions.** Suggests code fixes in IDE, but no generative UIs. | **Workflow Execution.** Triggers pre-built Jira/Slack automations. | **Actionable Workflows.** Agentic reasoning for cost/IaC, but bound to legacy UI. |
| **Backend Integration** | **Google Managed MCP + Go.** Direct, zero-install HTTP polling using standard MCP. | **Proprietary Agent.** Requires heavy sidecar and agent deployments. | **OneAgent.** Requires heavy installation; relies on proprietary Grail data lakes. | **Native GCP APIs.** Deep integration, but limited to GCP ecosystem. |

## 5. Technical Architecture Overview

* **Frontend Canvas:** WebGL (Three.js/Babylon) rendering the live cloud topology.
* **Frontend UI Runtime:** ArrowJS running within a secure WebAssembly (WASM) / QuickJS sandbox to execute AI-generated reactive components without a build step.
* **Backend Orchestrator:** `go-steer/core-agent` serving as a WebSocket daemon, managing the 3D viewport state and routing LLM prompts to Gemini 3.x via the Google Agent Development Kit (ADK).
* **Telemetry Layer:** Google Cloud Managed Remote MCP endpoints (`[container.googleapis.com/mcp](https://container.googleapis.com/mcp)`, `[logging.googleapis.com/mcp](https://logging.googleapis.com/mcp)`) secured via Cloud IAM.

## 6. MVP (P0) Requirements & Acceptance Criteria

The MVP scope is strictly limited to **Read-Only Observability for Google Kubernetes Engine (GKE)** to prove the core generative UI hypothesis safely.

### REQ 1: The Spatial Canvas (WebGL)

* **1.1:** Render a hierarchical 3D node-graph representing a single GCP project containing one GKE cluster, its namespaces, and active pods.
* **1.2:** Implement camera controls and object selection (clicking a 3D pod sets it as the active contextual target for the agent).
* **1.3:** Implement spatial context attachment and target reticles (clicking a 3D resource renders a glowing 3D targeting reticle around the node and visibly attaches it to the AI prompt context).
* *Acceptance:* User can view a GKE cluster in 3D, click a specific node to lock onto it with a 3D reticle, and see an explicit `@resource` context pill in the prompt input bar.

### REQ 2: The Agentic UI Runtime (ArrowJS Sandbox)

* **2.1:** Integrate the ArrowJS WASM sandbox directly into the browser client.
* **2.2:** Establish a secure bridge allowing the sandbox to receive JSON telemetry payloads from the Go backend while restricting DOM access outside its mount point.
* *Acceptance:* Browser receives an ArrowJS template string from the Go backend and renders it as a floating, reactive panel over the WebGL canvas.

### REQ 3: The Orchestrator (`go-steer`)

* **3.1:** Implement a WebSocket server in `core-agent` for bi-directional client communication.
* **3.2:** Assemble context payloads combining the user prompt and the selected 3D object ID, and route them to Gemini 3.x.
* **3.3:** Provide visual prompt context transparency in the HUD (displaying an inline `@resource-name` pill inside the prompt input box, explicit telemetry inclusion badges for `Live Logs`, `Metrics`, and `Blast Radius`, and a 1-click detach button to return to cluster-wide context).
* *Acceptance:* Go daemon successfully receives a prompt, dispatches it to the LLM, and pushes the resulting ArrowJS string back to the client while the HUD clearly displays the attached resource context.

### REQ 4: Telemetry Integration (GCP Managed MCP)

* **4.1:** Configure the agent to authenticate against GCP managed MCP servers using Application Default Credentials (ADC).
* **4.2:** Enable the agent to trigger `list_gke_namespaces` and `queryLogs` tools via MCP.
* *Acceptance:* Agent successfully queries live logs from a real GCP project using local IAM permissions and formats it for the ArrowJS UI.

## 7. Out of Scope for MVP (P1 / P2)

* **Write/Destructive Actions:** No permissions to delete pods, scale node pools, or alter infrastructure.
* **Multi-Cloud / Hybrid Cloud:** Restricted exclusively to Google Cloud Platform (GCP). AWS/Azure deferred to P2.
* **Custom Authentication / SSO:** Runs locally relying on the engineer's existing `gcloud auth` token. Web-based OAuth flows deferred to P1.

## 8. Success Metrics (KPIs)

1. **Time to Interactive (TTI):** Time from prompt submission to the ArrowJS widget successfully mounting in the WASM sandbox is **< 4 seconds**.
2. **Sandbox Isolation Success:** **Zero** instances of generated UI code successfully escaping the WebAssembly boundary to manipulate the host WebGL DOM tree.
3. **Contextual Accuracy:** **> 95%** of generated queries successfully map the user's prompt to the correct GCP Resource ID based on their 3D selection.

---

## Appendix: References & Market Validation

**1. Cost of IT Downtime Benchmarks**

* **The Claim:** Mid-to-large enterprises lose between $300,000 and $1,000,000 per hour of unplanned IT downtime.
* **The Source:** ITIC's 2024 Hourly Cost of Downtime Survey [1]. According to the study, 91% of mid-size and large enterprises report a single hour of downtime costs $300,000 or more, and 41% report hourly downtime costs exceeding $1 million [1].
* **Link:** [ITIC 2024 Hourly Cost of Downtime Report](https://itic-corp.com/itic-2024-hourly-cost-of-downtime-report/?utm_source=gemini) [3]

**2. The Model Context Protocol (MCP)**

* **The Claim:** The Go backend routes telemetry using standard MCP tool endpoints to avoid custom integrations.
* **The Source:** Model Context Protocol (MCP) Open Specification [1]. Hosted by The Linux Foundation, MCP provides a standardized JSON-RPC 2.0 message format for AI models to securely request capabilities and resources from external data sources [1].
* **Link:** [Model Context Protocol GitHub](https://github.com/modelcontextprotocol?utm_source=gemini) [1]

**3. Generative UI Runtime (ArrowJS)**

* **The Claim:** ArrowJS executes the LLM-generated UI code directly in the browser safely and without a build step.
* **The Source:** ArrowJS is a reactive UI framework built around native JavaScript primitives [2]. It is explicitly designed for the agentic era, allowing for the execution of agent-generated UI inside WebAssembly sandboxes without requiring build pipelines like Webpack or Vite [2].
* **Link:** [ArrowJS GitHub Repository](https://github.com/standardagents/arrow-js?utm_source=gemini) [2]

**4. Google Cloud Managed MCP Endpoints**

* **The Claim:** The platform avoids installing proprietary APM sidecars (like Datadog or Dynatrace) by relying on Google's native MCP servers.
* **The Source:** Google Cloud publishes official, managed MCP server packages (such as `gcloud-mcp`, `observability-mcp`, and `gke-mcp`) [2]. These utilize standard Application Default Credentials (ADC) for secure, IAM-compliant execution without sidecars [1, 2].
* **Link:** [Google Cloud gcloud-mcp Repository](https://github.com/googleapis/gcloud-mcp?utm_source=gemini) [2]