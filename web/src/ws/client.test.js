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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebSocketClient } from './client.js';

describe('WebSocketClient', () => {
  let client;
  let mockSocket;

  beforeEach(() => {
    mockSocket = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1, // OPEN
    };
    client = new WebSocketClient('ws://localhost:8080/ws');
    client.ws = mockSocket;
  });

  it('serializes init message correctly', () => {
    const sent = client.sendInit();
    expect(sent).toBe(true);
    expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'init' }));
  });

  it('serializes select_node message correctly', () => {
    const sent = client.selectNode('pod-123', 'gke://prod/pod-123');
    expect(sent).toBe(true);
    expect(mockSocket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'select_node',
        selected_node_id: 'pod-123',
        resource_uri: 'gke://prod/pod-123',
      })
    );
  });

  it('serializes prompt message correctly', () => {
    const sent = client.sendPrompt('pod-123', 'gke://prod/pod-123', 'Why is this failing?');
    expect(sent).toBe(true);
    expect(mockSocket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'prompt',
        selected_node_id: 'pod-123',
        resource_uri: 'gke://prod/pod-123',
        prompt: 'Why is this failing?',
      })
    );
  });

  it('dispatches topology event to listener', () => {
    const onTopology = vi.fn();
    client.onTopology = onTopology;

    const payload = {
      type: 'topology',
      topology: { clusters: [{ name: 'test-cluster' }] },
    };
    client._handleMessage(JSON.stringify(payload));

    expect(onTopology).toHaveBeenCalledWith(payload.topology);
  });

  it('dispatches ui_component event to listener', () => {
    const onUIComponent = vi.fn();
    client.onUIComponent = onUIComponent;

    const payload = {
      type: 'ui_component',
      code: '/* code */',
      telemetry: { pod_id: 'p1' },
    };
    client._handleMessage(JSON.stringify(payload));

    expect(onUIComponent).toHaveBeenCalledWith(payload);
  });

  it('dispatches error message to listener', () => {
    const onError = vi.fn();
    client.onError = onError;

    const payload = {
      type: 'error',
      message: 'Failed to fetch logs',
    };
    client._handleMessage(JSON.stringify(payload));

    expect(onError).toHaveBeenCalledWith(payload);
  });
});
