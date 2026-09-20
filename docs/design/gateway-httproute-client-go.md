# Implementation Plan: Fetching `Gateway` & `HTTPRoute` Directly via `k8s.io/client-go`

## 1. Root Cause & Live Verification on `ap-iap-testing`

**Yes — we can and should fetch `Gateway` and `HTTPRoute` directly from the Kubernetes Go client (`k8s.io/client-go`) during the initial and continuous 8-second 3D topology sync in [`pkg/gke/live.go`](file:///usr/local/google/home/garisingh/projects/ephemeris-live-gke/pkg/gke/live.go).**

Even though `gateway.networking.k8s.io/v1` is a Kubernetes Gateway API CRD (and therefore not part of the built-in `CoreV1()` or `AppsV1()` typed methods on `kubernetes.Clientset`), the existing `*kubernetes.Clientset` already exposes `cs.NetworkingV1().RESTClient()`, which can query any `/apis/<group>/<version>/<resource>` path on the Kubernetes API server over the exact same authenticated HTTP/2 connection in ~50ms—without needing MCP or an external dependency.

We verified this directly against live `ap-iap-testing` (`us-central1`) using `cs.NetworkingV1().RESTClient().Get().AbsPath(...)`:

- **`GET /apis/gateway.networking.k8s.io/v1/gateways`** returned:
  - **`Gateway`**: `default/external-gateway`
    - `spec.gatewayClassName`: `"gke-l7-gxlb"`
    - `spec.addresses`: `[{"type": "NamedAddress", "value": "iap-demo-gw"}]`
    - `spec.listeners`: `[{"name": "https", "port": 443, "protocol": "HTTPS"}]`
    - `status.addresses`: `[{"type": "IPAddress", "value": "34.149.247.177"}]`
- **`GET /apis/gateway.networking.k8s.io/v1/httproutes`** returned:
  - **`HTTPRoute`**: `default/nginx-external-route`
    - `spec.hostnames`: `["iap-gw.demo.gke.ninja"]`
    - `spec.parentRefs`: `[{"group": "gateway.networking.k8s.io", "kind": "Gateway", "name": "external-gateway"}]`
    - `spec.rules`: `[{"backendRefs": [{"group": "", "kind": "Service", "name": "nginx-service-gw", "port": 80, "weight": 1}]}]`

### Why `ap-iap-testing` Wasn't Showing Them Yet
1. [`fetchClusterViaClientGo`](file:///usr/local/google/home/garisingh/projects/ephemeris-live-gke/pkg/gke/live.go#L350-L398) only queried `CoreV1().Pods()`, `AppsV1().Deployments()`, `AppsV1().ReplicaSets()`, `AppsV1().StatefulSets()`, `AppsV1().DaemonSets()`, and `CoreV1().Services()`. It never queried `/apis/gateway.networking.k8s.io/v1/gateways` or `/apis/gateway.networking.k8s.io/v1/httproutes`.
2. [`buildNamespacesFromTypedLists`](file:///usr/local/google/home/garisingh/projects/ephemeris-live-gke/pkg/gke/live.go#L482-L497) iterated only over `nsPods` (`for ns, pods := range nsPods`), meaning any namespace containing `Gateway`, `HTTPRoute`, or `Service` objects without pods would be omitted.

---

## 2. Proposed Changes in [`pkg/gke/live.go`](file:///usr/local/google/home/garisingh/projects/ephemeris-live-gke/pkg/gke/live.go)

### A. Fetch `Gateway` & `HTTPRoute` Lists via `k8s.io/client-go` in `fetchClusterViaClientGo`
Add lightweight structs (`k8sGatewayList`, `k8sHTTPRouteList`) and helper `fetchGatewayAPIResources(ctx, cs)` in [`pkg/gke/live.go`](file:///usr/local/google/home/garisingh/projects/ephemeris-live-gke/pkg/gke/live.go):
- Query `/apis/gateway.networking.k8s.io/v1/gateways` (falling back to `/apis/gateway.networking.k8s.io/v1beta1/gateways` if `v1` is not registered on older clusters).
- Query `/apis/gateway.networking.k8s.io/v1/httproutes` (falling back to `/apis/gateway.networking.k8s.io/v1beta1/httproutes`).
- Also query `NetworkingV1().Ingresses("").List(ctx, ...)` so standard Kubernetes `Ingress` objects are mapped onto the `HTTPRoute`/`Ingress` tier as well.

### B. Wire Full 5-Tier Vertical Ownership & Traffic Tethers in `buildNamespacesFromTypedLists`
In [`buildNamespacesFromTypedLists`](file:///usr/local/google/home/garisingh/projects/ephemeris-live-gke/pkg/gke/live.go#L399-L501):
1. **Emit `Gateway` (`api.ResourceNode`) at Tier 5 (`Y = 4.20`):**
   - `ID`: `gw-<cluster>-<ns>-<name>` (`gw-ap-iap-testing-default-external-gateway`)
   - `Kind`: `"Gateway"`
   - `Status`: `"Ready"` if condition `Programmed=True` or `Accepted=True` (or IP assigned), else `"Pending"`
   - `Labels`: Include `gatewayClassName` (`gke-l7-gxlb`), listener ports/protocols (`HTTPS:443`), and external IP/address (`34.149.247.177` / `iap-demo-gw`) so clicking the Gateway node or inspecting it in the HUD displays its live load balancer configuration.
2. **Emit `HTTPRoute` (`api.ResourceNode`) at Tier 4 (`Y = 3.50`):**
   - `ID`: `route-<cluster>-<ns>-<name>` (`route-ap-iap-testing-default-nginx-external-route`)
   - `Kind`: `"HTTPRoute"`
   - `OwnerID`: Resolved from `spec.parentRefs` (`gw-<cluster>-<parentNs>-<parentName>`, e.g. `gw-ap-iap-testing-default-external-gateway`). Also append the `HTTPRoute` ID to the parent `Gateway`'s `ChildrenIDs` and `ConnectedTo`.
   - `ChildrenIDs` & `ConnectedTo`: Resolved from `spec.rules[].backendRefs` (`svc-<cluster>-<backendNs>-<backendName>`, e.g. `svc-ap-iap-testing-default-nginx-service-gw`).
   - `Labels`: Include `hostnames` (`iap-gw.demo.gke.ninja`) and backend service port (`nginx-service-gw:80`).
3. **Link `Service` (`Y = 2.80`) `OwnerID` to `HTTPRoute`:**
   - When an `HTTPRoute` references `svc-ap-iap-testing-default-nginx-service-gw` in `backendRefs`, set `Service.OwnerID = route.ID`.
   - This completes the uninterrupted 6-level 3D vertical tether stack on `ap-iap-testing`:
     ```
     Gateway (external-gateway, Y=4.20)
       └── HTTPRoute (nginx-external-route [iap-gw.demo.gke.ninja], Y=3.50)
             └── Service (nginx-service-gw:80, Y=2.80)
                   └── Deployment (nginx-deployment-gw, Y=2.05)
                         └── ReplicaSet (nginx-deployment-gw-67d47f7585, Y=1.35)
                               └── Pod (nginx-deployment-gw-67d47f7585-tjq7k, Y=0.32)
     ```
4. **Union of Namespaces (`nsPods` ∪ `nsRes`):**
   - Collect all unique namespaces across both `nsPods` and `nsRes` so any namespace that holds `Gateway`, `HTTPRoute`, or `Service` objects is always included in the cluster topology even if its pods live in another namespace or are scaled to zero.

---

## 3. Verification Plan
1. Add unit test coverage in [`pkg/gke/live_test.go`](file:///usr/local/google/home/garisingh/projects/ephemeris-live-gke/pkg/gke/live_test.go) verifying `buildNamespacesFromTypedLists` with `Gateway` (`external-gateway`) -> `HTTPRoute` (`nginx-external-route`) -> `Service` (`nginx-service-gw`) -> `Deployment` -> `ReplicaSet` -> `Pod` ownership and `ConnectedTo` tethers.
2. Rebuild and restart the live server (`./bin/ephemeris -mode=live -port 8080 -gcp-project=gke-demos-345619`) and verify via WebSocket inspection that `ap-iap-testing` (`default` namespace) immediately streams `Gateway/external-gateway` and `HTTPRoute/nginx-external-route` linked to `Service/nginx-service-gw`.
3. Run `dev/tools/ci` to confirm all Go and JS tests and linters pass.
