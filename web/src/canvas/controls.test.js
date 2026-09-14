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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CameraControls } from './controls.js';

describe('CameraControls', () => {
  let camera;
  let renderer;
  let scene;
  let controls;
  let domElement;

  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 1000);
    camera.position.set(0, 34, 52);

    domElement = document.createElement('canvas');
    domElement.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
    });

    renderer = {
      domElement: domElement,
    };

    scene = new THREE.Scene();
    controls = new CameraControls(camera, renderer, scene, () => []);
  });

  afterEach(() => {
    controls.destroy();
  });

  it('initializes with screenSpacePanning enabled for drag movement', () => {
    expect(controls.controls.screenSpacePanning).toBe(true);
    expect(controls.controls.enablePan).toBe(true);
    expect(controls.navMode).toBe('orbit');
  });

  it('switches navigation mode between orbit and pan', () => {
    controls.setNavMode('pan');
    expect(controls.navMode).toBe('pan');
    expect(controls.controls.mouseButtons.LEFT).toBe(THREE.MOUSE.PAN);
    expect(domElement.style.cursor).toBe('grab');

    controls.setNavMode('orbit');
    expect(controls.navMode).toBe('orbit');
    expect(controls.controls.mouseButtons.LEFT).toBe(THREE.MOUSE.ROTATE);
    expect(domElement.style.cursor).toBe('default');
  });

  it('focuses camera cleanly on a mesh with non-clipping isometric offset', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.4, 1.2),
      new THREE.MeshBasicMaterial()
    );
    mesh.position.set(10, 1, 20);
    mesh.userData = {
      type: 'pod',
      pod: { id: 'pod-1', name: 'payment-service', status: 'Running' },
    };

    controls.focusOnMesh(mesh);

    expect(controls.isTransitioning).toBe(true);
    // LookAt centered slightly above mesh base
    expect(controls.targetLookAt.x).toBe(10);
    expect(controls.targetLookAt.y).toBeCloseTo(1.4);
    expect(controls.targetLookAt.z).toBe(20);

    // Camera offset provides isometric breathing room (5.5, 4.0, 7.0)
    expect(controls.targetCameraPos.x).toBeCloseTo(15.5);
    expect(controls.targetCameraPos.y).toBeCloseTo(5.0);
    expect(controls.targetCameraPos.z).toBeCloseTo(27.0);

    // Reticle visible and centered
    expect(controls.reticleGroup.visible).toBe(true);
    expect(controls.reticleGroup.position.x).toBe(10);
  });

  it('focuses camera correctly using world coordinates when mesh is child of an offset group', () => {
    const parentGroup = new THREE.Group();
    parentGroup.position.set(40, 2, 60);
    scene.add(parentGroup);

    const childMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.4, 1.2),
      new THREE.MeshBasicMaterial()
    );
    childMesh.position.set(0, 0.7, 0);
    childMesh.userData = {
      type: 'pod',
      pod: { id: 'pod-batch', name: 'batch-ingestor', status: 'Pending' },
    };
    parentGroup.add(childMesh);
    parentGroup.updateMatrixWorld(true);

    controls.focusOnMesh(childMesh);

    expect(controls.targetLookAt.x).toBeCloseTo(40);
    expect(controls.targetLookAt.y).toBeCloseTo(3.1);
    expect(controls.targetLookAt.z).toBeCloseTo(60);
    expect(controls.targetCameraPos.x).toBeCloseTo(45.5);
    expect(controls.targetCameraPos.z).toBeCloseTo(67.0);
  });

  it('focuses camera smoothly on a cluster position', () => {
    const clusterPos = new THREE.Vector3(48, 0, 48);
    controls.focusOnCluster(clusterPos);

    expect(controls.isTransitioning).toBe(true);
    expect(controls.targetLookAt.x).toBe(48);
    expect(controls.targetLookAt.z).toBe(48);
    expect(controls.targetCameraPos.x).toBe(48);
    expect(controls.targetCameraPos.y).toBe(20);
    expect(controls.targetCameraPos.z).toBe(76);
  });

  it('resets view to default overview position', () => {
    controls.resetView();
    expect(controls.isTransitioning).toBe(true);
    expect(controls.targetCameraPos.x).toBe(0);
    expect(controls.targetCameraPos.y).toBe(34);
    expect(controls.targetCameraPos.z).toBe(52);
    expect(controls.reticleGroup.visible).toBe(false);
  });
});
