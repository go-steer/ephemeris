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
    this.controls.minDistance = 3;
    this.controls.maxDistance = 240;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.05; // Don't flip below grid
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true; // Essential: allows left/right and up/down dragging across camera plane
    this.controls.panSpeed = 1.2;

    // Enable keyboard panning (WASD / arrow keys)
    if (typeof window !== 'undefined') {
      this.controls.listenToKeyEvents(window);
    }

    // Cancel automatic transitions immediately if user manually interacts with camera
    this.controls.addEventListener('start', () => {
      this.isTransitioning = false;
    });

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.hoveredObject = null;
    this.selectedPod = null;
    this.selectedMesh = null;

    // Navigation mode: 'orbit' (rotate) or 'pan' (translate focus)
    this.navMode = 'orbit';

    // Smooth camera transition state
    this.isTransitioning = false;
    this.targetCameraPos = new THREE.Vector3();
    this.targetLookAt = new THREE.Vector3();
    this.transitionLerp = 0.08;

    // Default overview position
    this.defaultCameraPos = new THREE.Vector3(0, 34, 52);
    this.defaultLookAt = new THREE.Vector3(0, 0, 0);

    // Visual targeting reticle
    this._createReticle();

    // Callbacks
    this.onSelectNode = null;

    // Bound event handlers
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);

    this.domElement = renderer.domElement;
    this.domElement.addEventListener('pointermove', this._onPointerMove);
    this.domElement.addEventListener('pointerdown', this._onPointerDown);

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
    }
  }

  _createReticle() {
    this.reticleGroup = new THREE.Group();
    this.reticleGroup.visible = false;

    // Outer rotating targeting ring (proportional to compact node scale)
    const ringGeo = new THREE.RingGeometry(1.2, 1.4, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x4285f4, // Google Blue
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    this.reticleRing = new THREE.Mesh(ringGeo, ringMat);
    this.reticleRing.rotation.x = Math.PI / 2;
    this.reticleGroup.add(this.reticleRing);

    // Inner dashed indicator
    const innerRingGeo = new THREE.RingGeometry(1.5, 1.6, 16);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0xea4335, // Google Red
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      wireframe: true,
    });
    this.reticleInner = new THREE.Mesh(innerRingGeo, innerRingMat);
    this.reticleInner.rotation.x = Math.PI / 2;
    this.reticleGroup.add(this.reticleInner);

    this.scene.add(this.reticleGroup);
  }

  /**
   * Set camera navigation mode: 'orbit' (default rotate) or 'pan' (drag to move focus).
   * @param {'orbit'|'pan'} mode
   */
  setNavMode(mode) {
    this.navMode = mode;
    if (mode === 'pan') {
      this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      this.domElement.style.cursor = 'grab';
    } else {
      this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      this.domElement.style.cursor = 'default';
    }
  }

  _onKeyDown(e) {
    // Hold Shift or Space to temporarily drag-pan with left mouse
    if (e.key === 'Shift' || e.code === 'Space') {
      this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      this.domElement.style.cursor = 'grab';
    }
  }

  _onKeyUp(e) {
    if (e.key === 'Shift' || e.code === 'Space') {
      if (this.navMode !== 'pan') {
        this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        this.domElement.style.cursor = 'default';
      }
    }
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
    // If in pan mode, or holding modifier keys, allow drag-panning without selecting
    if (this.navMode === 'pan' || e.shiftKey || e.button === 2) return;
    // Only handle primary left click for node selection
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
   * @param {THREE.Vector3} [customOffset=null]
   */
  focusOnMesh(mesh, customOffset = null) {
    if (this.selectedMesh && this.selectedMesh !== mesh) {
      this.selectedMesh.scale.set(1.0, 1.0, 1.0);
    }

    this.selectedMesh = mesh;
    this.selectedPod = mesh.userData.pod;
    mesh.scale.set(1.25, 1.25, 1.25);

    // Position reticle around the mesh in absolute world space
    const meshPos = new THREE.Vector3();
    if (typeof mesh.getWorldPosition === 'function') {
      mesh.getWorldPosition(meshPos);
    } else {
      meshPos.copy(mesh.position);
    }

    this.reticleGroup.position.copy(meshPos);
    this.reticleGroup.visible = true;

    // Set smooth camera transition target cleanly centered on pod
    this.targetLookAt.copy(meshPos);
    this.targetLookAt.y += 0.4;

    // Close-up foreground isometric offset framing the pod cleanly without foreground obstruction
    const offset = customOffset || new THREE.Vector3(-3.0, 2.5, 5.2);
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
   * Focus camera smoothly on a cluster platform.
   * @param {THREE.Vector3} clusterPos
   */
  focusOnCluster(clusterPos) {
    if (!clusterPos) return;
    this.reticleGroup.visible = false;
    this.targetLookAt.copy(clusterPos);
    this.targetCameraPos.set(clusterPos.x, clusterPos.y + 20, clusterPos.z + 28);
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
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
    }
    this.controls.dispose();
  }
}
