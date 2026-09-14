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
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * CameraControls manages OrbitControls, raycaster hover & click targeting,
 * smooth camera transitions, and visual targeting reticles.
 */
export class CameraControls {
  /**
   * @param {THREE.Camera} camera
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {function(): THREE.Object3D[]} getInteractablesFn
   */
  constructor(camera, renderer, scene, getInteractablesFn) {
    this.camera = camera;
    this.renderer = renderer;
    this.scene = scene;
    this.getInteractables = getInteractablesFn;

    this.controls = new OrbitControls(camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 220;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.1; // Don't flip below grid

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.hoveredObject = null;
    this.selectedPod = null;
    this.selectedMesh = null;

    // Smooth camera transition state
    this.isTransitioning = false;
    this.targetCameraPos = new THREE.Vector3();
    this.targetLookAt = new THREE.Vector3();
    this.transitionLerp = 0.08;

    // Default overview position
    this.defaultCameraPos = new THREE.Vector3(0, 42, 68);
    this.defaultLookAt = new THREE.Vector3(0, 0, 0);

    // Visual targeting reticle
    this._createReticle();

    // Callbacks
    this.onSelectNode = null;

    // Bound event handlers
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);

    this.domElement = renderer.domElement;
    this.domElement.addEventListener('pointermove', this._onPointerMove);
    this.domElement.addEventListener('pointerdown', this._onPointerDown);
  }

  _createReticle() {
    this.reticleGroup = new THREE.Group();
    this.reticleGroup.visible = false;

    // Outer rotating targeting ring
    const ringGeo = new THREE.RingGeometry(2.4, 2.7, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    this.reticleRing = new THREE.Mesh(ringGeo, ringMat);
    this.reticleRing.rotation.x = Math.PI / 2;
    this.reticleGroup.add(this.reticleRing);

    // Inner dashed indicator
    const innerRingGeo = new THREE.RingGeometry(2.9, 3.0, 16);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0xff0055,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
      wireframe: true,
    });
    this.reticleInner = new THREE.Mesh(innerRingGeo, innerRingMat);
    this.reticleInner.rotation.x = Math.PI / 2;
    this.reticleGroup.add(this.reticleInner);

    this.scene.add(this.reticleGroup);
  }

  _getPointerCoords(e) {
    const rect = this.domElement.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    };
  }

  _onPointerMove(e) {
    const coords = this._getPointerCoords(e);
    this.mouse.x = coords.x;
    this.mouse.y = coords.y;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const interactables = this.getInteractables ? this.getInteractables() : [];
    const intersects = this.raycaster.intersectObjects(interactables, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (this.hoveredObject !== hit) {
        this._unhover();
        this.hoveredObject = hit;
        this.domElement.style.cursor = 'pointer';
        // Subtle scale highlight
        hit.scale.set(1.2, 1.2, 1.2);
      }
    } else {
      this._unhover();
    }
  }

  _unhover() {
    if (this.hoveredObject) {
      if (this.hoveredObject !== this.selectedMesh) {
        this.hoveredObject.scale.set(1.0, 1.0, 1.0);
      }
      this.hoveredObject = null;
      this.domElement.style.cursor = 'default';
    }
  }

  _onPointerDown(e) {
    // Only handle primary left click
    if (e.button !== 0) return;

    const coords = this._getPointerCoords(e);
    this.mouse.x = coords.x;
    this.mouse.y = coords.y;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const interactables = this.getInteractables ? this.getInteractables() : [];
    const intersects = this.raycaster.intersectObjects(interactables, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (hit.userData && hit.userData.type === 'pod') {
        this.focusOnMesh(hit);
      }
    }
  }

  /**
   * Focus camera and place reticle on a specific pod mesh.
   * @param {THREE.Mesh} mesh
   */
  focusOnMesh(mesh) {
    if (this.selectedMesh && this.selectedMesh !== mesh) {
      this.selectedMesh.scale.set(1.0, 1.0, 1.0);
    }

    this.selectedMesh = mesh;
    this.selectedPod = mesh.userData.pod;
    mesh.scale.set(1.25, 1.25, 1.25);

    // Position reticle around the mesh
    this.reticleGroup.position.copy(mesh.position);
    this.reticleGroup.visible = true;

    // Set smooth camera transition target
    const meshPos = mesh.position.clone();
    this.targetLookAt.copy(meshPos);

    // Offset camera slightly elevated and back from pod
    const offset = new THREE.Vector3(7, 5, 9);
    this.targetCameraPos.copy(meshPos).add(offset);
    this.isTransitioning = true;

    if (this.onSelectNode) {
      this.onSelectNode(mesh.userData.pod, mesh.userData);
    }
  }

  /**
   * Reset view to default overview.
   */
  resetView() {
    if (this.selectedMesh) {
      this.selectedMesh.scale.set(1.0, 1.0, 1.0);
      this.selectedMesh = null;
      this.selectedPod = null;
    }
    this.reticleGroup.visible = false;
    this.targetCameraPos.copy(this.defaultCameraPos);
    this.targetLookAt.copy(this.defaultLookAt);
    this.isTransitioning = true;
  }

  /**
   * Called every frame from scene render loop.
   * @param {number} time
   */
  update(time) {
    // Spin targeting reticle
    if (this.reticleGroup.visible) {
      this.reticleRing.rotation.z = time * 0.002;
      this.reticleInner.rotation.z = -time * 0.003;
    }

    // Smooth camera transition lerp
    if (this.isTransitioning) {
      this.camera.position.lerp(this.targetCameraPos, this.transitionLerp);
      this.controls.target.lerp(this.targetLookAt, this.transitionLerp);

      if (
        this.camera.position.distanceTo(this.targetCameraPos) < 0.1 &&
        this.controls.target.distanceTo(this.targetLookAt) < 0.1
      ) {
        this.camera.position.copy(this.targetCameraPos);
        this.controls.target.copy(this.targetLookAt);
        this.isTransitioning = false;
      }
    }

    this.controls.update();
  }

  destroy() {
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.controls.dispose();
  }
}
