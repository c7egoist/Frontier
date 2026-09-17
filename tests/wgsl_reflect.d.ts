/**
 * `wgsl_reflect` ships no types. Only the two things this repo uses are declared, so the shape is
 * documented where it is consumed (tools/check-wgsl.mjs and tests/textures.test.ts).
 */
declare module 'wgsl_reflect/wgsl_reflect.module.js' {
  export interface ReflectResource {
    name: string;
    type: { name?: string } | string;
    group: number;
    binding: number;
  }
  export interface ReflectEntry {
    name: string;
    resources?: ReflectResource[];
  }
  export class WgslReflect {
    constructor(code: string);
    entry: { compute?: ReflectEntry[]; fragment?: ReflectEntry[]; vertex?: ReflectEntry[] };
    entry: { compute: ReflectEntry[]; fragment: ReflectEntry[]; vertex: ReflectEntry[] };
  }
}
