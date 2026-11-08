import { gardenGround } from './garden-terrain.js';
import { GARDEN } from './garden.js';
import { COURSE, clamp, centerX, widthAt, portalCrossing } from './course.js';
// Deliberately small arcade-greybox controller, independent of rendering and DOM.
export function stepVehicle(car, input, dt, obstacle = () => false, worldIndex = 0) {
  const { throttle = false, brake = false, hard = false, steer = 0 } = input;
  if (throttle) car.speed += 19 * dt;
  if (brake) car.speed -= (car.speed > 1 ? 30 : 10) * dt;
  if (hard) car.speed *= Math.exp(-5 * dt);
  car.speed -= car.speed * (.12 + (throttle ? 0 : .28)) * dt;
  if(worldIndex===1&&Math.abs(car.speed)>.3){
    const dx=Math.sin(car.heading),dz=Math.cos(car.heading),grade=(gardenGround(car.x+dx,car.z+dz)-gardenGround(car.x-dx,car.z-dz))/2;
    car.speed-=grade*8*dt;
  }
  car.speed = clamp(car.speed, -10, worldIndex === 1 ? GARDEN.maxSpeed : COURSE.maxSpeed);
  const turning = Math.min(1, Math.abs(car.speed) / 7) * (.8 - Math.min(Math.abs(car.speed) / 150, .3));
  car.heading += clamp(steer, -1, 1) * turning * dt * Math.sign(car.speed);
  const previousZ = car.z, nx = car.x + Math.sin(car.heading) * car.speed * dt, nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const contact = obstacle(nx, nz);
  if (!contact) { car.x = nx; car.z = nz; } else car.speed *= .18;
  if (worldIndex === 0) {
    const offset = car.x - centerX(car.z), limit = widthAt(car.z) + 3;
    if (Math.abs(offset) > limit) { car.x = centerX(car.z) + Math.sign(offset) * limit; car.speed *= Math.exp(-3 * dt); }
    car.z = Math.max(-24, car.z);
    if (car.z >= COURSE.length - 4 && Math.abs(car.x - centerX(COURSE.length)) > 9) { car.z = COURSE.length - 4.1; car.speed = 0; }
    if (portalCrossing(previousZ, car.z, car.x, worldIndex)) {
      car.x = COURSE.destination.x; car.z = COURSE.destination.z; car.heading = 0;
      return { contact, crossed: true };
    }
  } else if(worldIndex === 1){
    car.x=clamp(car.x,GARDEN.x-182,GARDEN.x+182);car.z=clamp(car.z,GARDEN.z-12,GARDEN.z+505);
  } else {
    car.x=clamp(car.x,GARDEN.landing.x-26,GARDEN.landing.x+26);car.z=clamp(car.z,GARDEN.landing.z-5,GARDEN.landing.z+GARDEN.landing.length);
  }
  return { contact, crossed: false };
}
