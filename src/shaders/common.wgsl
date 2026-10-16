const PI: f32 = 3.14159265359;
const RAY_EPSILON: f32 = 0.012;
const FAR_DISTANCE: f32 = 100.0;
const INVALID_ID: u32 = 4294967295u;

struct FrameUniform {
  cameraPosition: vec4<f32>,
  cameraForward: vec4<f32>,
  cameraRight: vec4<f32>,
  cameraUp: vec4<f32>,
  previousCameraPosition: vec4<f32>,
  previousCameraForward: vec4<f32>,
  previousCameraRight: vec4<f32>,
  previousCameraUp: vec4<f32>,
  screen: vec4<u32>,               // width, height, frame index, object count
  quality: vec4<u32>,              // max bounces, initial candidates, history M cap, spatial taps
  settings: vec4<f32>,             // tan half-FOV, aspect, GI strength, exposure (EV)
  thresholds: vec4<f32>,           // history clamp, firefly clamp, denoise strength, delta seconds
  sceneLayout0: vec4<u32>,         // BVH nodes, triangle indices, mesh records, object records
  sceneLayout1: vec4<u32>,         // materials, lights, light count, material count
  sun: vec4<f32>,                  // direction toward sun, radiance scale
  sky: vec4<f32>,                  // sky tint, intensity
  features: vec4<u32>,             // history valid, temporal, spatial, checkerboard
  display: vec4<u32>,              // debug mode, denoise enabled, output width, output height
};

@group(0) @binding(0) var<uniform> Frame: FrameUniform;

struct TriangleRecord {
  p0: vec4<f32>,
  p1: vec4<f32>,
  p2: vec4<f32>,
  n0: vec4<f32>,
  n1: vec4<f32>,
  n2: vec4<f32>,
  ids: vec4<u32>,
};

@group(0) @binding(1) var<storage, read> Triangles: array<TriangleRecord>;
@group(0) @binding(2) var<storage, read> Scene: array<u32>;

struct HitRecord {
  worldPosition: vec3<f32>,
  worldNormal: vec3<f32>,
  localPosition: vec3<f32>,
  localNormal: vec3<f32>,
  distance: f32,
  objectId: u32,
  materialId: u32,
  valid: u32,
};

struct SurfaceMaterial {
  albedo: vec3<f32>,
  roughness: f32,
  emission: vec3<f32>,
  idslness: f32,
  specular: f32,
};

struct GBufferRecord {
  worldPosition: vec4<f32>,
  worldNormalRoughness: vec4<f32>,
  albedoMetalness: vec4<f32>,
  directRadiance: vec4<f32>,
  ids: vec4<u32>,           // object id, material id, valid, flags
};

struct ReservoirRecord {
  samplePositionTarget: vec4<f32>,   // endpoint local position (or sky direction), selected target in .w
  sampleNormalWeight: vec4<f32>,     // endpoint local normal, reservoir weight sum in .w
  pathRadianceM: vec4<f32>,          // multi-bounce path radiance, represented candidate count in .w
  ids: vec4<u32>,                   // endpoint object id, valid, age, sky sample flag
};

struct CandidateEvaluation {
  contribution: vec3<f32>,
  targetValue: f32,
  proposalPdf: f32,
  valid: u32,
};

fn loadFloat(wordOffset: u32) -> f32 {
  return bitcast<f32>(Scene[wordOffset]);
}

fn loadVec3(wordOffset: u32) -> vec3<f32> {
  return vec3<f32>(loadFloat(wordOffset), loadFloat(wordOffset + 1u), loadFloat(wordOffset + 2u));
}

fn loadVec4(wordOffset: u32) -> vec4<f32> {
  return vec4<f32>(loadFloat(wordOffset), loadFloat(wordOffset + 1u), loadFloat(wordOffset + 2u), loadFloat(wordOffset + 3u));
}

fn loadMatrix(wordOffset: u32) -> mat4x4<f32> {
  return mat4x4<f32>(
    loadVec4(wordOffset),
    loadVec4(wordOffset + 4u),
    loadVec4(wordOffset + 8u),
    loadVec4(wordOffset + 12u)
  );
}

fn objectRecordOffset(objectId: u32) -> u32 {
  return Frame.sceneLayout0.w + objectId * 52u;
}

fn objectModel(objectId: u32) -> mat4x4<f32> {
  return loadMatrix(objectRecordOffset(objectId));
}

fn objectInverseModel(objectId: u32) -> mat4x4<f32> {
  return loadMatrix(objectRecordOffset(objectId) + 16u);
}

fn objectPreviousModel(objectId: u32) -> mat4x4<f32> {
  return loadMatrix(objectRecordOffset(objectId) + 32u);
}

fn objectMeshIndex(objectId: u32) -> u32 {
  return Scene[objectRecordOffset(objectId) + 48u];
}

fn loadMaterial(materialId: u32) -> SurfaceMaterial {
  let base = Frame.sceneLayout1.x + min(materialId, Frame.sceneLayout1.w - 1u) * 16u;
  return SurfaceMaterial(
    loadVec3(base), loadFloat(base + 3u), loadVec3(base + 4u), loadFloat(base + 7u), loadFloat(base + 8u)
  );
}

fn loadMeshRoot(meshIndex: u32) -> u32 {
  return Scene[Frame.sceneLayout0.z + meshIndex * 4u];
}

fn emptyHit() -> HitRecord {
  return HitRecord(vec3<f32>(0.0), vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(0.0),
                   vec3<f32>(0.0, 0.0, 1.0), FAR_DISTANCE, INVALID_ID, 0u, 0u);
}

fn emptyReservoir() -> ReservoirRecord {
  return ReservoirRecord(vec4<f32>(0.0), vec4<f32>(0.0), vec4<f32>(0.0),
                         vec4<u32>(INVALID_ID, 0u, 0u, 0u));
}

fn intersectBounds(origin: vec3<f32>, direction: vec3<f32>, minimum: vec3<f32>, maximum: vec3<f32>, maxDistance: f32) -> bool {
  var nearDistance = 0.0;
  var farDistance = maxDistance;
  for (var axis = 0u; axis < 3u; axis += 1u) {
    let rayDirection = direction[axis];
    let rayOrigin = origin[axis];
    if (abs(rayDirection) < 1.0e-8) {
      if (rayOrigin < minimum[axis] || rayOrigin > maximum[axis]) {
        return false;
      }
    } else {
      let inverseDirection = 1.0 / rayDirection;
      var a = (minimum[axis] - rayOrigin) * inverseDirection;
      var b = (maximum[axis] - rayOrigin) * inverseDirection;
      if (a > b) {
        let swap = a;
        a = b;
        b = swap;
      }
      nearDistance = max(nearDistance, a);
      farDistance = min(farDistance, b);
      if (farDistance < nearDistance) {
        return false;
      }
    }
  }
  return farDistance > 0.0;
}

fn intersectTriangle(origin: vec3<f32>, direction: vec3<f32>, tri: TriangleRecord) -> vec3<f32> {
  let edge1 = tri.p1.xyz - tri.p0.xyz;
  let edge2 = tri.p2.xyz - tri.p0.xyz;
  let p = cross(direction, edge2);
  let determinant = dot(edge1, p);
  if (abs(determinant) < 1.0e-8) {
    return vec3<f32>(-1.0, 0.0, 0.0);
  }
  let inverseDeterminant = 1.0 / determinant;
  let tvec = origin - tri.p0.xyz;
  let u = dot(tvec, p) * inverseDeterminant;
  if (u < 0.0 || u > 1.0) {
    return vec3<f32>(-1.0, 0.0, 0.0);
  }
  let q = cross(tvec, edge1);
  let v = dot(direction, q) * inverseDeterminant;
  if (v < 0.0 || u + v > 1.0) {
    return vec3<f32>(-1.0, 0.0, 0.0);
  }
  let distance = dot(edge2, q) * inverseDeterminant;
  return vec3<f32>(distance, u, v);
}

// Stack-based traversal of object-space triangle BVHs. Rigid instances reuse the same BLAS; moving-car matrices are
// updated independently, so the GTX-compatible compute path does not rebuild triangles every frame.
fn traceScene(origin: vec3<f32>, direction: vec3<f32>, maxDistance: f32) -> HitRecord {
  var best = emptyHit();
  best.distance = maxDistance;
  for (var objectId = 0u; objectId < Frame.screen.w; objectId += 1u) {
    let inverseModel = objectInverseModel(objectId);
    let model = objectModel(objectId);
    let localOrigin = (inverseModel * vec4<f32>(origin, 1.0)).xyz;
    let localDirection = normalize((inverseModel * vec4<f32>(direction, 0.0)).xyz);
    let meshRoot = loadMeshRoot(objectMeshIndex(objectId));
    var stack: array<u32, 48>;
    var stackSize = 1u;
    stack[0] = meshRoot;
    loop {
      if (stackSize == 0u) { break; }
      stackSize -= 1u;
      let nodeIndex = stack[stackSize];
      let nodeBase = Frame.sceneLayout0.x + nodeIndex * 12u;
      let nodeMinimum = loadVec3(nodeBase);
      let nodeMaximum = loadVec3(nodeBase + 4u);
      if (!intersectBounds(localOrigin, localDirection, nodeMinimum, nodeMaximum, best.distance)) {
        continue;
      }
      let leftOrFirst = Scene[nodeBase + 8u];
      let count = Scene[nodeBase + 9u];
      if (count > 0u) {
        for (var leafIndex = 0u; leafIndex < count; leafIndex += 1u) {
          let triangleIndex = Scene[Frame.sceneLayout0.y + leftOrFirst + leafIndex];
          let tri = Triangles[triangleIndex];
          let intersection = intersectTriangle(localOrigin, localDirection, tri);
          let distance = intersection.x;
          if (distance > RAY_EPSILON && distance < best.distance) {
            let baryU = intersection.y;
            let baryV = intersection.z;
            var localNormal = normalize(tri.n0.xyz * (1.0 - baryU - baryV) + tri.n1.xyz * baryU + tri.n2.xyz * baryV);
            if (dot(localNormal, localDirection) > 0.0) { localNormal = -localNormal; }
            let worldNormal = normalize((model * vec4<f32>(localNormal, 0.0)).xyz);
            let localPosition = localOrigin + localDirection * distance;
            best.worldPosition = origin + direction * distance;
            best.worldNormal = select(worldNormal, -worldNormal, dot(worldNormal, direction) > 0.0);
            best.localPosition = localPosition;
            best.localNormal = localNormal;
            best.distance = distance;
            best.objectId = objectId;
            best.materialId = tri.ids.x;
            best.valid = 1u;
          }
        }
      } else {
        let rightChild = Scene[nodeBase + 10u];
        if (stackSize + 2u <= 48u) {
          stack[stackSize] = rightChild;
          stack[stackSize + 1u] = leftOrFirst;
          stackSize += 2u;
        }
      }
    }
  }
  return best;
}

fn luminance(color: vec3<f32>) -> f32 {
  return max(dot(color, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0);
}

fn hashUint(value: u32) -> u32 {
  var x = value;
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}

fn randomFloat(state: ptr<function, u32>) -> f32 {
  *state = hashUint(*state + 0x9e3779b9u);
  return f32(*state & 0x00ffffffu) * (1.0 / 16777216.0);
}

fn makeSeed(pixelIndex: u32, frameIndex: u32, salt: u32) -> u32 {
  return hashUint(pixelIndex * 1664525u + frameIndex * 1013904223u + salt * 747796405u + 2891336453u);
}

fn cosineHemisphere(normal: vec3<f32>, state: ptr<function, u32>) -> vec3<f32> {
  let r = sqrt(randomFloat(state));
  let phi = 2.0 * PI * randomFloat(state);
  let local = vec3<f32>(r * cos(phi), r * sin(phi), sqrt(max(0.0, 1.0 - r * r)));
  let helper = select(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 0.0), abs(normal.z) > 0.999);
  let tangent = normalize(cross(helper, normal));
  let bitangent = cross(normal, tangent);
  return normalize(tangent * local.x + bitangent * local.y + normal * local.z);
}

fn uniformSphere(state: ptr<function, u32>) -> vec3<f32> {
  let z = 1.0 - 2.0 * randomFloat(state);
  let phi = 2.0 * PI * randomFloat(state);
  let radius = sqrt(max(0.0, 1.0 - z * z));
  return vec3<f32>(radius * cos(phi), radius * sin(phi), z);
}

fn environmentRadiance(direction: vec3<f32>) -> vec3<f32> {
  let height = max(direction.z, 0.0);
  let horizon = vec3<f32>(0.085, 0.105, 0.13);
  let zenith = vec3<f32>(0.28, 0.39, 0.48);
  return mix(horizon, zenith, pow(height, 0.65)) * Frame.sky.xyz * Frame.sky.w;
}

fn directAtSurface(hit: HitRecord, viewDirection: vec3<f32>, state: ptr<function, u32>) -> vec3<f32> {
  let material = loadMaterial(hit.materialId);
  let normal = hit.worldNormal;
  let diffuseAlbedo = material.albedo * (1.0 - material.idslness);
  var result = material.emission + diffuseAlbedo * environmentRadiance(normal) * 0.055;

  let sunDirection = normalize(Frame.sun.xyz);
  let sunCosine = max(dot(normal, sunDirection), 0.0);
  if (sunCosine > 0.0 && Frame.sun.w > 0.0) {
    let shadow = traceScene(hit.worldPosition + normal * RAY_EPSILON, sunDirection, FAR_DISTANCE);
    if (shadow.valid == 0u) {
      let sunRadiance = vec3<f32>(Frame.sun.w);
      result += diffuseAlbedo * sunRadiance * (sunCosine / PI);
      let halfVector = normalize(sunDirection + viewDirection);
      let rough = clamp(material.roughness, 0.035, 1.0);
      let power = mix(160.0, 3.0, rough * rough);
      let f0 = mix(vec3<f32>(material.specular), material.albedo, material.idslness);
      result += f0 * pow(max(dot(normal, halfVector), 0.0), power) * (Frame.sun.w * sunCosine * 0.035);
    }
  }

  let lightCount = Frame.sceneLayout1.z;
  if (lightCount > 0u) {
    let lightIndex = min(u32(randomFloat(state) * f32(lightCount)), lightCount - 1u);
    let lightBase = Frame.sceneLayout1.y + lightIndex * 16u;
    let center = loadVec3(lightBase);
    let uAxis = loadVec3(lightBase + 4u);
    let vAxis = loadVec3(lightBase + 8u);
    let lightRadiance = loadVec3(lightBase + 12u);
    let samplePosition = center + uAxis * (2.0 * randomFloat(state) - 1.0) + vAxis * (2.0 * randomFloat(state) - 1.0);
    let delta = samplePosition - hit.worldPosition;
    let distanceSquared = max(dot(delta, delta), 0.04);
    let distance = sqrt(distanceSquared);
    let lightDirection = delta / distance;
    let surfaceCosine = max(dot(normal, lightDirection), 0.0);
    if (surfaceCosine > 0.0) {
      let lightNormal = normalize(cross(uAxis, vAxis));
      let lightCosine = abs(dot(lightNormal, -lightDirection));
      let shadow = traceScene(hit.worldPosition + normal * RAY_EPSILON, lightDirection, max(distance - RAY_EPSILON * 1.4, RAY_EPSILON));
      if (shadow.valid == 0u) {
        let area = 4.0 * length(cross(uAxis, vAxis));
        result += diffuseAlbedo * lightRadiance * (surfaceCosine * lightCosine * area * f32(lightCount) / (PI * distanceSquared));
        let halfVector = normalize(lightDirection + viewDirection);
        let rough = clamp(material.roughness, 0.035, 1.0);
        let power = mix(140.0, 3.0, rough * rough);
        let f0 = mix(vec3<f32>(material.specular), material.albedo, material.idslness);
        result += f0 * lightRadiance * (pow(max(dot(normal, halfVector), 0.0), power) * surfaceCosine * lightCosine * area * f32(lightCount) / distanceSquared * 0.02);
      }
    }
  }
  return result;
}

fn traceContinuation(firstHit: HitRecord, initialViewDirection: vec3<f32>, state: ptr<function, u32>) -> vec3<f32> {
  var accumulated = vec3<f32>(0.0);
  var throughput = vec3<f32>(1.0);
  var currentHit = firstHit;
  var viewDirection = initialViewDirection;
  let maximumBounces = clamp(Frame.quality.x, 1u, 8u);
  for (var bounce = 0u; bounce < maximumBounces; bounce += 1u) {
    if (currentHit.valid == 0u) { break; }
    let material = loadMaterial(currentHit.materialId);
    accumulated += throughput * directAtSurface(currentHit, viewDirection, state);
    if (bounce + 1u >= maximumBounces) { break; }

    var nextDirection: vec3<f32>;
    if (material.idslness > 0.72) {
      let perfect = reflect(-viewDirection, currentHit.worldNormal);
      let roughDirection = normalize(perfect + uniformSphere(state) * (material.roughness * material.roughness * 0.28));
      nextDirection = select(perfect, roughDirection, material.roughness > 0.04);
      throughput *= mix(vec3<f32>(material.specular), material.albedo, material.idslness);
    } else {
      nextDirection = cosineHemisphere(currentHit.worldNormal, state);
      throughput *= material.albedo * (1.0 - material.idslness);
    }

    if (bounce >= 2u) {
      let survival = clamp(max(throughput.x, max(throughput.y, throughput.z)), 0.12, 0.88);
      if (randomFloat(state) > survival) { break; }
      throughput /= survival;
    }

    let nextHit = traceScene(currentHit.worldPosition + currentHit.worldNormal * RAY_EPSILON, nextDirection, FAR_DISTANCE);
    if (nextHit.valid == 0u) {
      accumulated += throughput * environmentRadiance(nextDirection);
      break;
    }
    viewDirection = -nextDirection;
    currentHit = nextHit;
  }
  let value = luminance(accumulated);
  if (value > Frame.thresholds.y && value > 1.0e-5) {
    accumulated *= Frame.thresholds.y / value;
  }
  return accumulated;
}

fn evaluateCandidate(surface: GBufferRecord, reservoir: ReservoirRecord, checkVisibility: bool) -> CandidateEvaluation {
  if (surface.ids.z == 0u || reservoir.ids.y == 0u) {
    return CandidateEvaluation(vec3<f32>(0.0), 0.0, 0.0, 0u);
  }
  let normal = normalize(surface.worldNormalRoughness.xyz);
  let albedo = surface.albedoMetalness.xyz * (1.0 - surface.albedoMetalness.w);
  let pathRadiance = reservoir.pathRadianceM.xyz;
  if (reservoir.ids.w != 0u) {
    let skyDirection = normalize(reservoir.samplePositionTarget.xyz);
    let cosine = max(dot(normal, skyDirection), 0.0);
    if (cosine <= 0.0) { return CandidateEvaluation(vec3<f32>(0.0), 0.0, 0.0, 0u); }
    let contribution = albedo * pathRadiance * (cosine / PI);
    let targetValue = luminance(contribution);
    return CandidateEvaluation(contribution, targetValue, max(cosine / PI, 1.0e-8), select(0u, 1u, targetValue > 1.0e-7));
  }
  if (reservoir.ids.x >= Frame.screen.w) {
    return CandidateEvaluation(vec3<f32>(0.0), 0.0, 0.0, 0u);
  }
  let endpointModel = objectModel(reservoir.ids.x);
  let endpointPosition = (endpointModel * vec4<f32>(reservoir.samplePositionTarget.xyz, 1.0)).xyz;
  let endpointNormal = normalize((endpointModel * vec4<f32>(reservoir.sampleNormalWeight.xyz, 0.0)).xyz);
  let delta = endpointPosition - surface.worldPosition.xyz;
  let distanceSquared = max(dot(delta, delta), 0.04);
  let distance = sqrt(distanceSquared);
  let direction = delta / distance;
  let cosineSurface = max(dot(normal, direction), 0.0);
  let cosineEndpoint = max(dot(endpointNormal, -direction), 0.0);
  if (cosineSurface <= 0.0 || cosineEndpoint <= 0.0) {
    return CandidateEvaluation(vec3<f32>(0.0), 0.0, 0.0, 0u);
  }
  if (checkVisibility) {
    let shadow = traceScene(surface.worldPosition.xyz + normal * RAY_EPSILON, direction, max(distance - RAY_EPSILON * 1.4, RAY_EPSILON));
    if (shadow.valid != 0u) {
      return CandidateEvaluation(vec3<f32>(0.0), 0.0, 0.0, 0u);
    }
  }
  let contribution = albedo * pathRadiance * (cosineSurface * cosineEndpoint / (PI * distanceSquared));
  let targetValue = luminance(contribution);
  let proposalPdf = max(cosineSurface * cosineEndpoint / (PI * distanceSquared), 1.0e-8);
  return CandidateEvaluation(contribution, targetValue, proposalPdf, select(0u, 1u, targetValue > 1.0e-7));
}

fn createCandidate(surface: GBufferRecord, state: ptr<function, u32>) -> ReservoirRecord {
  let normal = normalize(surface.worldNormalRoughness.xyz);
  let direction = cosineHemisphere(normal, state);
  let hit = traceScene(surface.worldPosition.xyz + normal * RAY_EPSILON, direction, FAR_DISTANCE);
  var candidate = emptyReservoir();
  var evaluation: CandidateEvaluation;
  if (hit.valid == 0u) {
    candidate.samplePositionTarget = vec4<f32>(direction, 0.0);
    candidate.sampleNormalWeight = vec4<f32>(0.0);
    candidate.pathRadianceM = vec4<f32>(environmentRadiance(direction), 0.0);
    candidate.ids = vec4<u32>(INVALID_ID, 1u, 0u, 1u);
    evaluation = evaluateCandidate(surface, candidate, false);
  } else {
    let pathRadiance = traceContinuation(hit, -direction, state);
    candidate.samplePositionTarget = vec4<f32>(hit.localPosition, 0.0);
    candidate.sampleNormalWeight = vec4<f32>(hit.localNormal, 0.0);
    candidate.pathRadianceM = vec4<f32>(pathRadiance, 0.0);
    candidate.ids = vec4<u32>(hit.objectId, 1u, 0u, 0u);
    evaluation = evaluateCandidate(surface, candidate, false);
  }
  if (evaluation.valid == 0u || evaluation.proposalPdf <= 0.0) {
    return emptyReservoir();
  }
  let weight = evaluation.targetValue / evaluation.proposalPdf;
  if (!(weight > 0.0) || weight > 1.0e30) {
    return emptyReservoir();
  }
  candidate.samplePositionTarget.w = evaluation.targetValue;
  candidate.sampleNormalWeight.w = weight;
  candidate.pathRadianceM.w = 1.0;
  return candidate;
}

fn addReservoirSample(current: ReservoirRecord, sample: ReservoirRecord, weight: f32, representedCount: f32,
                      targetAtDestination: f32, age: u32, state: ptr<function, u32>) -> ReservoirRecord {
  if (sample.ids.y == 0u || !(weight > 0.0) || weight > 1.0e30) { return current; }
  var result = current;
  let newWeightSum = current.sampleNormalWeight.w + weight;
  if (randomFloat(state) * max(newWeightSum, 1.0e-8) < weight) {
    result.samplePositionTarget = vec4<f32>(sample.samplePositionTarget.xyz, targetAtDestination);
    result.sampleNormalWeight = vec4<f32>(sample.sampleNormalWeight.xyz, newWeightSum);
    result.pathRadianceM = vec4<f32>(sample.pathRadianceM.xyz, current.pathRadianceM.w + representedCount);
    result.ids = vec4<u32>(sample.ids.x, 1u, age, sample.ids.w);
  } else {
    result.sampleNormalWeight.w = newWeightSum;
    result.pathRadianceM.w = current.pathRadianceM.w + representedCount;
  }
  return result;
}

fn reprojectPreviousPixel(surface: GBufferRecord, pixelX: u32, pixelY: u32) -> vec2<i32> {
  let currentObject = surface.ids.x;
  if (currentObject >= Frame.screen.w) { return vec2<i32>(-1, -1); }
  let inverse = objectInverseModel(currentObject);
  let localPosition = (inverse * vec4<f32>(surface.worldPosition.xyz, 1.0)).xyz;
  let previousWorld = (objectPreviousModel(currentObject) * vec4<f32>(localPosition, 1.0)).xyz;
  let relative = previousWorld - Frame.previousCameraPosition.xyz;
  let viewZ = dot(relative, Frame.previousCameraForward.xyz);
  if (viewZ <= 0.01) { return vec2<i32>(-1, -1); }
  let ndcX = dot(relative, Frame.previousCameraRight.xyz) / (viewZ * Frame.settings.x * Frame.settings.y);
  let ndcY = dot(relative, Frame.previousCameraUp.xyz) / (viewZ * Frame.settings.x);
  let uv = vec2<f32>(ndcX * 0.5 + 0.5, 0.5 - ndcY * 0.5);
  let x = i32(round(uv.x * f32(Frame.screen.x) - 0.5));
  let y = i32(round(uv.y * f32(Frame.screen.y) - 0.5));
  if (x < 0 || y < 0 || x >= i32(Frame.screen.x) || y >= i32(Frame.screen.y)) {
    return vec2<i32>(-1, -1);
  }
  return vec2<i32>(x, y);
}

fn validateHistory(current: GBufferRecord, previous: GBufferRecord) -> bool {
  if (current.ids.z == 0u || previous.ids.z == 0u || current.ids.x != previous.ids.x || current.ids.y != previous.ids.y) {
    return false;
  }
  let inverse = objectInverseModel(current.ids.x);
  let localPosition = (inverse * vec4<f32>(current.worldPosition.xyz, 1.0)).xyz;
  let expectedPreviousPosition = (objectPreviousModel(current.ids.x) * vec4<f32>(localPosition, 1.0)).xyz;
  let localNormal = normalize((inverse * vec4<f32>(current.worldNormalRoughness.xyz, 0.0)).xyz);
  let expectedPreviousNormal = normalize((objectPreviousModel(current.ids.x) * vec4<f32>(localNormal, 0.0)).xyz);
  let normalDot = dot(expectedPreviousNormal, normalize(previous.worldNormalRoughness.xyz));
  if (normalDot < 0.88) { return false; }
  let depthTolerance = max(0.045, current.worldPosition.w * 0.025);
  if (distance(expectedPreviousPosition, previous.worldPosition.xyz) > depthTolerance) { return false; }
  if (abs(current.worldNormalRoughness.w - previous.worldNormalRoughness.w) > 0.2) { return false; }
  return true;
}

fn compatibleNeighbor(current: GBufferRecord, neighbor: GBufferRecord) -> bool {
  if (current.ids.z == 0u || neighbor.ids.z == 0u) { return false; }
  let normalDot = dot(normalize(current.worldNormalRoughness.xyz), normalize(neighbor.worldNormalRoughness.xyz));
  if (normalDot < 0.84) { return false; }
  let planeDistance = abs(dot(neighbor.worldPosition.xyz - current.worldPosition.xyz, normalize(current.worldNormalRoughness.xyz)));
  if (planeDistance > max(0.09, current.worldPosition.w * 0.018)) { return false; }
  if (abs(current.worldNormalRoughness.w - neighbor.worldNormalRoughness.w) > 0.28) { return false; }
  return true;
}
