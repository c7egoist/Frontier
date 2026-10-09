// Perspective preview of the heightmap, draped with the active satmap. Three.js is loaded on demand.
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default function Terrain3D({ result, rgba, exaggeration, worldSize }) {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);

  // One renderer for the lifetime of the component.
  useEffect(() => {
    const host = hostRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x141414, 1);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 200000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xdfe7ff, 0x3a3228, 1.1));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sun.position.set(-1, 1.4, 0.6).normalize().multiplyScalar(10000);
    scene.add(sun);
    const state = { renderer, scene, camera, controls, mesh: null, water: null, frame: 0, fitted: false };
    sceneRef.current = state;

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const loop = () => {
      state.frame = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(state.frame);
      observer.disconnect();
      controls.dispose();
      if (state.mesh) {
        state.mesh.geometry.dispose();
        state.mesh.material.dispose();
      }
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
    };
  }, []);

  // Rebuild the surface whenever the terrain or the satmap changes.
  useEffect(() => {
    const state = sceneRef.current;
    if (!state || !result || !rgba) return;
    const { n, cs, height, seaLevel } = result;
    const W = n * cs;
    const positions = new Float32Array(n * n * 3);
    const colors = new Float32Array(n * n * 3);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        positions[i * 3] = x * cs - W / 2;
        positions[i * 3 + 1] = height[i] * exaggeration;
        positions[i * 3 + 2] = y * cs - W / 2;
        colors[i * 3] = rgba[i * 4] / 255;
        colors[i * 3 + 1] = rgba[i * 4 + 1] / 255;
        colors[i * 3 + 2] = rgba[i * 4 + 2] / 255;
      }
    }
    const index = [];
    for (let y = 0; y < n - 1; y++) {
      for (let x = 0; x < n - 1; x++) {
        const a = y * n + x;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();

    if (state.mesh) {
      state.scene.remove(state.mesh);
      state.mesh.geometry.dispose();
      state.mesh.material.dispose();
    }
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    state.mesh = new THREE.Mesh(geometry, material);
    state.scene.add(state.mesh);

    if (!state.water) {
      state.water = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x2f6f86, transparent: true, opacity: 0.72, roughness: 0.2 }));
      state.water.rotation.x = -Math.PI / 2;
      state.scene.add(state.water);
    }
    state.water.scale.set(W, W, 1);
    state.water.position.set(0, seaLevel * exaggeration, 0);

    if (!state.fitted) {
      state.camera.position.set(W * 0.75, W * 0.55, W * 0.95);
      state.controls.target.set(0, (height[(n * n) >> 1] || 0) * exaggeration, 0);
      state.controls.maxDistance = W * 4;
      state.fitted = true;
    }
  }, [result, rgba, exaggeration]);

  // The water plane follows the sea level through the fixed scene, so only the camera needs world size.
  useEffect(() => {
    const state = sceneRef.current;
    if (state) {
      state.camera.far = Math.max(20000, worldSize * 20);
      state.camera.updateProjectionMatrix();
    }
  }, [worldSize]);

  return <div ref={hostRef} className="terrain-3d" aria-label="Perspective terrain preview" />;
}
