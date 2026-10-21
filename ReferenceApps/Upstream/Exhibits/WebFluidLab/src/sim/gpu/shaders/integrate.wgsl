// Pass 4/4 — semi-implicit Euler integration, tank & collider contact
// response (friction + restitution-free normal response) and a soft
// "wetting" adhesion zone just outside every surface so sticky materials
// (chocolate, mud) visibly cling to objects and walls instead of free-falling.

fn resolveContact(
  pos: ptr<function, vec3<f32>>,
  vel: ptr<function, vec3<f32>>,
  dist: f32,
  normal: vec3<f32>,
  radius: f32,
  friction: f32,
  adhesion: f32,
  dt: f32,
  contactAccum: ptr<function, f32>,
) {
  let pen = radius - dist;
  if (pen > 0.0) {
    *pos = *pos + normal * pen;
    let vn = dot(*vel, normal);
    if (vn < 0.0) {
      *vel = *vel - normal * vn;
    }
    let stick = clamp(adhesion * 1.4, 0.0, 0.97);
    *vel = *vel * ((1.0 - friction) * (1.0 - stick * 0.6));
    *contactAccum = max(*contactAccum, clamp(adhesion, 0.0, 1.0));
  } else if (dist < radius * 3.5 && adhesion > 0.05) {
    let pull = adhesion * (1.0 - dist / (radius * 3.5));
    *vel = *vel - normal * pull * 2.4 * dt;
    *contactAccum = max(*contactAccum, pull * 0.5);
  }
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(params.counts.x)) {
    return;
  }
  var p = particles[i];
  let mat = materials[u32(p.props.x)];
  let dt = params.p0.x;

  var vel = p.velocity.xyz + p.accel.xyz * dt;
  vel = vel * exp(-mat.c.w * 9.0 * dt);
  var pos = p.position.xyz + vel * dt;

  var contact = 0.0;
  let radius = mat.b.w;
  let friction = mat.b.y;
  let adhesion = mat.b.x;

  resolveContact(&pos, &vel, pos.y - params.domainMin.y, vec3<f32>(0.0, 1.0, 0.0), radius, friction, adhesion, dt, &contact);
  resolveContact(&pos, &vel, params.domainMax.x - pos.x, vec3<f32>(-1.0, 0.0, 0.0), radius, friction, adhesion, dt, &contact);
  resolveContact(&pos, &vel, pos.x - params.domainMin.x, vec3<f32>(1.0, 0.0, 0.0), radius, friction, adhesion, dt, &contact);
  resolveContact(&pos, &vel, params.domainMax.z - pos.z, vec3<f32>(0.0, 0.0, -1.0), radius, friction, adhesion, dt, &contact);
  resolveContact(&pos, &vel, pos.z - params.domainMin.z, vec3<f32>(0.0, 0.0, 1.0), radius, friction, adhesion, dt, &contact);

  let numColliders = u32(params.counts.y);
  for (var ci = 0u; ci < numColliders; ci = ci + 1u) {
    let c = colliders[ci];
    let hit = evalCollider(pos, c);
    resolveContact(&pos, &vel, hit.dist, hit.normal, radius, friction, adhesion, dt, &contact);
  }

  // Bingham-plastic-style yield behaviour: thick materials (mud, chocolate)
  // have a yield speed below which residual SPH jitter gets strongly braked
  // instead of persisting forever, so a poured pile actually comes to rest
  // instead of gently simmering indefinitely.
  let yieldSpeed = mat.c.w * 0.9;
  let restSpeed = length(vel);
  if (yieldSpeed > 0.001 && restSpeed < yieldSpeed) {
    let t = clamp(restSpeed / yieldSpeed, 0.0, 1.0);
    vel = vel * mix(0.015, 1.0, t);
  }

  let speed = length(vel);
  let maxSpeed = 9.0;
  if (speed > maxSpeed) {
    vel = vel * (maxSpeed / speed);
  }

  p.position = vec4<f32>(pos, p.position.w);
  p.velocity = vec4<f32>(vel, p.velocity.w);
  p.props.y = p.props.y + dt;
  p.props.z = contact;
  particles[i] = p;
}
