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

/**
 * WebSocketClient manages the bidirectional WebSocket connection with the Go daemon,
 * automatic reconnect, message dispatching, and protocol serialization.
 */
export class WebSocketClient {
  /**
   * @param {string} [url] - WebSocket URL or auto-computed from window.location.
   */
  constructor(url) {
    this.url = url || this._computeDefaultUrl();
    this.ws = null;
    this.isConnected = false;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectDelayMs = 10000;
    this.reconnectTimer = null;
    this.pendingQueue = [];

    // Callbacks
    this.onTopology = null;
    this.onStatus = null;
    this.onTelemetry = null;
    this.onUIComponent = null;
    this.onError = null;
    this.onConnectionChange = null;
  }

  _computeDefaultUrl() {
    if (typeof window === 'undefined') return 'ws://localhost:8080/ws';
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${loc.host}/ws`;
  }

  connect() {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this._notifyConnection('connecting');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this._notifyConnection('connected');
        this.sendInit();
        while (this.pendingQueue.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
          const queued = this.pendingQueue.shift();
          this.ws.send(JSON.stringify(queued));
        }
      };

      this.ws.onmessage = (event) => {
        this._handleMessage(event.data);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this._notifyConnection('disconnected');
        this._scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket connection error:', err);
        if (this.onError) {
          this.onError({ message: 'WebSocket connection error' });
        }
      };
    } catch (e) {
      console.warn('Failed to construct WebSocket:', e);
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.isReconnecting = true;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelayMs);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  _notifyConnection(state) {
    if (this.onConnectionChange) {
      this.onConnectionChange(state);
    }
  }

  _handleMessage(rawData) {
    try {
      const msg = JSON.parse(rawData);
      switch (msg.type) {
        case 'topology':
          if (this.onTopology) this.onTopology(msg.topology);
          break;
        case 'status':
          if (this.onStatus) this.onStatus(msg.message || msg.status);
          break;
        case 'telemetry':
          if (this.onTelemetry) this.onTelemetry(msg.telemetry);
          break;
        case 'ui_component':
          if (this.onUIComponent) this.onUIComponent(msg.ui || msg);
          break;
        case 'error':
          if (this.onError) this.onError(msg);
          break;
        default:
          console.log('Unhandled WebSocket message:', msg);
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message JSON:', err, rawData);
    }
  }

  _send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (payload && payload.type !== 'init') {
        this.pendingQueue.push(payload);
      }
      if (
        !this.ws ||
        this.ws.readyState === WebSocket.CLOSED ||
        this.ws.readyState === WebSocket.CLOSING
      ) {
        this.connect();
      }
      return false;
    }
    this.ws.send(JSON.stringify(payload));
    return true;
  }

  sendInit() {
    return this._send({ type: 'init' });
  }

  selectNode(nodeId, resourceUri) {
    return this._send({
      type: 'select_node',
      selected_node_id: nodeId,
      resource_uri: resourceUri,
    });
  }

  sendPrompt(nodeId, resourceUri, promptText) {
    return this._send({
      type: 'prompt',
      selected_node_id: nodeId,
      resource_uri: resourceUri,
      prompt: promptText,
    });
  }

  sendRemediate(podId, action = 'rollback') {
    return this._send({
      type: 'remediate',
      selected_node_id: podId,
      remediation_action: action,
    });
  }

  sendScenario(scenarioId) {
    return this._send({
      type: 'scenario',
      scenario_id: scenarioId,
    });
  }

  sendScaleTest(preset = 'large', config = null) {
    return this._send({
      type: 'scale_test',
      scale_preset: preset,
      scale_config: config || undefined,
    });
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this._notifyConnection('disconnected');
  }
}
