Here is the complete, standalone Three.js script that generates the 3D Kubernetes Pod representation.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3D Kubernetes Pod</title>
    <style>
        body { margin: 0; overflow: hidden; background-color: #f8f9fa; }
        canvas { display: block; }
    </style>
</head>
<body>
    <!-- Import Three.js and OrbitControls via ES Modules -->
    <script type="importmap">
        {
            "imports": {
                "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
                "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
            }
        }
    </script>

    <script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

        // 1. Scene Setup
        const scene = new THREE.Scene();
        
        // 2. Camera Setup
        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.set(0, 5, 8);

        // 3. Renderer Setup
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(renderer.domElement);

        // 4. Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        scene.add(directionalLight);

        // Create a group to hold the entire Pod assembly
        const podGroup = new THREE.Group();
        scene.add(podGroup);

        const k8sBlue = 0x326CE5;

        // 5. Inner Container (Solid Hexagon)
        // CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)
        const containerGeometry = new THREE.CylinderGeometry(1, 1, 2, 6);
        const containerMaterial = new THREE.MeshStandardMaterial({ 
            color: k8sBlue,
            roughness: 0.4,
            metalness: 0.1
        });
        const containerMesh = new THREE.Mesh(containerGeometry, containerMaterial);
        podGroup.add(containerMesh);

        // 6. Outer Pod Boundary (Dashed Heptagon)
        const podGeometry = new THREE.CylinderGeometry(2, 2, 2.5, 7);
        const edges = new THREE.EdgesGeometry(podGeometry);
        
        // Compute line distances to enable the dashed effect
        const lineMaterial = new THREE.LineDashedMaterial({
            color: k8sBlue,
            linewidth: 2,
            scale: 1,
            dashSize: 0.3,
            gapSize: 0.2
        });
        
        const podBoundary = new THREE.LineSegments(edges, lineMaterial);
        podBoundary.computeLineDistances(); // Required for LineDashedMaterial
        podGroup.add(podBoundary);

        // 7. Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        // Handle Window Resizing
        window.addEventListener('resize', onWindowResize, false);
        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        // 8. Animation Loop
        function animate() {
            requestAnimationFrame(animate);

            // Slowly rotate the entire pod group
            podGroup.rotation.y += 0.005;
            podGroup.rotation.x = Math.sin(Date.now() * 0.001) * 0.1; // Slight hover effect

            controls.update();
            renderer.render(scene, camera);
        }

        animate();
    </script>
</body>
</html>

```

### Key Implementation Details

* **Geometric Primitives:** The `THREE.CylinderGeometry` is used for both shapes. By setting `radialSegments` to `6`, it becomes a perfect hexagon. Setting it to `7` makes it a heptagon.
* **The Dashed Border:** To achieve the dashed outline of the official Pod icon without rendering solid faces, the script extracts the edges of the heptagon using `THREE.EdgesGeometry`, renders them using a `THREE.LineDashedMaterial`, and crucially calls `computeLineDistances()` so the dashes render correctly along the segments.
* **ES Modules:** The code uses an import map to pull the ES Module versions of Three.js and `OrbitControls` directly from a CDN, which is the modern standard for avoiding build steps while prototyping WebGL.