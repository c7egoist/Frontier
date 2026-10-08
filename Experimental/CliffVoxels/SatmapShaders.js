//============================================================================================================================================
//                                                             SATMAPSHADERS.JS
//============================================================================================================================================
// 📦 Three.js PBR materials and diagnostic Satmap shaders for Voxel Cliffs.

import * as THREE from 'three';

/**
 * Creates a rich PBR material for the voxel cliff.
 */
export class CliffMaterials {
    /**
     * Clay Mode Material: Smooth sculptural clay shading with soft cavity shading.
     */
    static createClayMaterial() {
        return new THREE.MeshStandardMaterial({
            color: new THREE.Color('#dcd6cc'),
            roughness: 0.85,
            metalness: 0.05,
            flatShading: false,
            side: THREE.DoubleSide
        });
    }

    /**
     * Wireframe Overlay Material.
     */
    static createWireframeMaterial() {
        return new THREE.MeshStandardMaterial({
            color: new THREE.Color('#e08a38'),
            wireframe: true,
            roughness: 0.5
        });
    }

    /**
     * Satmap Textured PBR Material (Uses Vertex Colors + Roughness).
     */
    static createSatmapMaterial(mode = 'composite') {
        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.88,
            metalness: 0.08,
            flatShading: false,
            side: THREE.DoubleSide
        });

        // Custom shader hook to allow live Satmap mode switching (Slope, Strata, Cavity, Flow, Composite)
        mat.onBeforeCompile = (shader) => {
            shader.uniforms.uSatmapMode = { value: mode === 'slope' ? 1 : (mode === 'strata' ? 2 : (mode === 'cavity' ? 3 : (mode === 'flow' ? 4 : 0))) };

            // Inject attribute and varying for satmaps (slope, strata, cavity, flow)
            shader.vertexShader = `
                attribute vec4 aSatmap;
                varying vec4 vSatmap;
                varying vec3 vWorldNormal;
                varying vec3 vWorldPos;
                ${shader.vertexShader}
            `;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                vSatmap = aSatmap;
                vWorldNormal = normalize(mat3(modelMatrix) * normal);
                vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                `
            );

            shader.fragmentShader = `
                uniform int uSatmapMode;
                varying vec4 vSatmap;
                varying vec3 vWorldNormal;
                varying vec3 vWorldPos;
                ${shader.fragmentShader}
            `;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `
                #include <color_fragment>

                // Diagnostic view modes
                if (uSatmapMode == 1) {
                    // SLOPE MAP: Green (flat, y=1) -> Yellow -> Red (vertical, y=0) -> Magenta (overhang, y < 0)
                    float ny = vWorldNormal.y;
                    if (ny < -0.05) {
                        diffuseColor.rgb = vec3(1.0, 0.1, 0.8); // Overhang >90° highlighted in vibrant magenta!
                    } else {
                        float s = clamp(1.0 - max(0.0, ny), 0.0, 1.0);
                        diffuseColor.rgb = mix(vec3(0.2, 0.85, 0.3), vec3(0.9, 0.15, 0.1), s);
                    }
                } else if (uSatmapMode == 2) {
                    // STRATA MAP: Sedimentary band phase rainbow
                    float p = fract(vSatmap.y);
                    diffuseColor.rgb = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + p));
                } else if (uSatmapMode == 3) {
                    // CAVITY MAP: Grayscale ambient crevice depth
                    float c = clamp(vSatmap.z, 0.0, 1.0);
                    diffuseColor.rgb = vec3(c);
                } else if (uSatmapMode == 4) {
                    // FLOW MAP: Gully drainage chutes in Cyan/Blue
                    float f = clamp(vSatmap.w, 0.0, 1.0);
                    diffuseColor.rgb = mix(vec3(0.15, 0.15, 0.2), vec3(0.0, 0.9, 1.0), f);
                } else {
                    // COMPOSITE: Vertex colors modulated with subtle procedural grain
                    float grain = sin(vWorldPos.x * 30.0) * sin(vWorldPos.y * 30.0) * sin(vWorldPos.z * 30.0);
                    diffuseColor.rgb = clamp(diffuseColor.rgb * (0.95 + 0.1 * grain), 0.0, 1.0);
                }
                `
            );

            mat.userData.shader = shader;
        };

        return mat;
    }
}
