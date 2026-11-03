declare module 'wgsl_reflect/wgsl_reflect.module.js' {
  export interface WgslMember { name: string; offset: number; size: number; type?: { name: string } }
  export interface WgslStruct { name: string; size: number; members: WgslMember[] }
  export interface WgslUniform { name: string; size: number; members?: WgslMember[] }
  export interface WgslEntry { name: string }
  export interface WgslBinding { name: string; group: number; binding: number }
  export class WgslReflect {
    constructor(source: string);
    structs: WgslStruct[];
    uniforms: WgslUniform[];
    entry: { vertex: WgslEntry[]; fragment: WgslEntry[]; compute: WgslEntry[] };
    getBindGroups(): (WgslBinding | null)[][];
  }
}
