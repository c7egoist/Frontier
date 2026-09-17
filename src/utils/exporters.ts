import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { BuildingConfig } from '../types/generator';

/**
 * Trigger browser file download
 */
function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Export building as binary .GLB file (Unreal Engine 5, Unity, Blender ready)
 */
export function exportToGLB(sceneOrGroup: THREE.Object3D, filename = 'procedural_asian_building.glb') {
  const exporter = new GLTFExporter();
  exporter.parse(
    sceneOrGroup,
    (gltf) => {
      const blob = new Blob([gltf as ArrayBuffer], { type: 'application/octet-stream' });
      downloadBlob(blob, filename);
    },
    (error) => {
      console.error('Error exporting GLTF/GLB:', error);
    },
    { binary: true, embedImages: true }
  );
}

/**
 * Export building as .OBJ file
 */
export function exportToOBJ(sceneOrGroup: THREE.Object3D, filename = 'procedural_asian_building.obj') {
  const exporter = new OBJExporter();
  const result = exporter.parse(sceneOrGroup);
  const blob = new Blob([result], { type: 'text/plain' });
  downloadBlob(blob, filename);
}

/**
 * Export building configuration as JSON
 */
export function exportConfigJSON(config: BuildingConfig, filename = 'building_config.json') {
  const jsonStr = JSON.stringify(config, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  downloadBlob(blob, filename);
}
