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

import * as THREE from 'three';

/**
 * SceneManager encapsulates the Three.js canvas, perspective camera,
 * WebGL renderer, spatial lighting, and requestAnimationFrame render loop.
 */
export class SceneManager {
  /**
   * @param {HTMLElement} container - The DOM element hosting the canvas.
   */
  constructor(container) {
    this.container = container;
    this.animationCallbacks = [];
    this.isRunning = false;
    this.animationFrameId = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x202124);
    this.scene.fog = new THREE.FogExp2(0x202124, 0.0035);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    this.camera.position.set(0, 48, 76);

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
    } catch {
      // In headless or jsdom test environments without WebGL
      this.renderer = {
        domElement: document.createElement('canvas'),
        setSize: () => {},
        setPixelRatio: () => {},
        render: () => {},
        dispose: () => {},
      };
    }

    container.appendChild(this.renderer.domElement);

    this._setupLighting();
    this._setupEnvironment();

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  _setupLighting() {
    // Ambient light for base visibility across Google Cloud material surfaces
    const ambient = new THREE.AmbientLight(0xe8eaed, 1.8);
    this.scene.add(ambient);

    // Directional key light for crisp architectural shadows and highlights
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
    dirLight.position.set(40, 70, 50);
    this.scene.add(dirLight);

    // Cool secondary fill light
    const fillLight = new THREE.DirectionalLight(0x8ab4f8, 1.2);
    fillLight.position.set(-50, 30, -40);
    this.scene.add(fillLight);

    // Soft Aurora rim accent
    const rimLight = new THREE.DirectionalLight(0xa770ef, 0.8);
    rimLight.position.set(0, -20, -50);
    this.scene.add(rimLight);
  }

  _setupEnvironment() {
    // Architectural spatial grid in Google Material Grey 800 and 700
    const gridHelper = new THREE.GridHelper(260, 52, 0x5f6368, 0x2a2b2e);
    gridHelper.position.y = -1.2;
    gridHelper.material.opacity = 0.4;
    gridHelper.material.transparent = true;
    this.scene.add(gridHelper);

    // Subtle atmospheric dust particles
    const particleCount = 400;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const blueColor = new THREE.Color(0x8ab4f8);
    const greyColor = new THREE.Color(0x5f6368);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 280;
      positions[i3 + 1] = (Math.random() - 0.5) * 100 + 10;
      positions[i3 + 2] = (Math.random() - 0.5) * 280;

      const mixed = Math.random() > 0.6 ? blueColor : greyColor;
      colors[i3] = mixed.r;
      colors[i3 + 1] = mixed.g;
      colors[i3 + 2] = mixed.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
    });

    this.dust = new THREE.Points(geometry, material);
    this.scene.add(this.dust);
  }

  _onResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Register a callback to be called on every animation frame.
   * @param {function(number): void} cb - Callback taking timestamp in ms.
   */
  addUpdateListener(cb) {
    this.animationCallbacks.push(cb);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    const animate = (time) => {
      if (!this.isRunning) return;
      this.animationFrameId = requestAnimationFrame(animate);

      if (this.dust) {
        this.dust.rotation.y = time * 0.00003;
      }

      for (const cb of this.animationCallbacks) {
        cb(time);
      }

      this.renderer.render(this.scene, this.camera);
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
