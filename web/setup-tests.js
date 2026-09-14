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

// Provide mock 2D canvas context for jsdom environment so text sprites and
// canvas operations execute smoothly without throwing not-implemented errors.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function (contextId) {
    if (contextId === '2d') {
      return {
        clearRect: () => {},
        fillText: () => {},
        measureText: (text) => ({ width: (text || '').length * 8 }),
        beginPath: () => {},
        roundRect: () => {},
        fill: () => {},
        stroke: () => {},
        font: '',
        textAlign: '',
        textBaseline: '',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
      };
    }
    return null;
  };
}
