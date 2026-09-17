/**
 * Uniform-buffer schema helper.
 *
 * One source of truth for the CPU-side parameter buffer and the WGSL `struct Globals`
 * declaration. Writing this by hand twice is the single most common source of silent
 * WebGPU bugs (a field shifted by 4 bytes reads garbage forever).
 *
 * Layout follows the WGSL *uniform* address space rules:
 *   f32/i32/u32 -> align 4,  size 4
 *   vec2        -> align 8,  size 8
 *   vec3        -> align 16, size 12
 *   vec4        -> align 16, size 16
 *   mat4x4f     -> align 16, size 64
 * (arrays are intentionally unsupported: in uniform space their stride is 16 per element,
 * which is a foot-gun; use vec4s.)
 */

export type FieldType = 'f32' | 'i32' | 'u32' | 'vec2f' | 'vec3f' | 'vec4f' | 'vec2u' | 'vec3u' | 'vec4u' | 'mat4x4f';

interface TypeInfo {
  wgsl: string;
  align: number;
  size: number;
  /** number of scalar slots written by set() */
  slots: number;
}

const TYPES: Record<FieldType, TypeInfo> = {
  f32: { wgsl: 'f32', align: 4, size: 4, slots: 1 },
  i32: { wgsl: 'i32', align: 4, size: 4, slots: 1 },
  u32: { wgsl: 'u32', align: 4, size: 4, slots: 1 },
  vec2f: { wgsl: 'vec2<f32>', align: 8, size: 8, slots: 2 },
  vec3f: { wgsl: 'vec3<f32>', align: 16, size: 12, slots: 3 },
  vec4f: { wgsl: 'vec4<f32>', align: 16, size: 16, slots: 4 },
  vec2u: { wgsl: 'vec2<u32>', align: 8, size: 8, slots: 2 },
  vec3u: { wgsl: 'vec3<u32>', align: 16, size: 12, slots: 3 },
  vec4u: { wgsl: 'vec4<u32>', align: 16, size: 16, slots: 4 },
  mat4x4f: { wgsl: 'mat4x4<f32>', align: 16, size: 64, slots: 16 },
};

export interface FieldSpec {
  name: string;
  type: FieldType;
  /** optional doc comment emitted into the WGSL struct */
  doc?: string;
}

export interface FieldLayout extends FieldSpec {
  offset: number;
  size: number;
  align: number;
  slots: number;
}

export class UniformSchema {
  readonly fields: FieldLayout[];
  readonly byteSize: number;
  private readonly byName = new Map<string, FieldLayout>();

  constructor(readonly structName: string, specs: readonly FieldSpec[]) {
    let offset = 0;
    let maxAlign = 4;
    const fields: FieldLayout[] = [];
    for (const spec of specs) {
      const info = TYPES[spec.type];
      if (!info) throw new Error(`Unknown uniform field type "${spec.type}" for ${spec.name}`);
      offset = align(offset, info.align);
      const layout: FieldLayout = { ...spec, offset, size: info.size, align: info.align, slots: info.slots };
      fields.push(layout);
      this.byName.set(spec.name, layout);
      offset += info.size;
      maxAlign = Math.max(maxAlign, info.align);
    }
    this.fields = fields;
    this.byteSize = align(offset, maxAlign);
  }

  /** Layout of one field, for CPU-side writes (setField / pack). */
  get(name: string): FieldLayout | undefined {
    return this.byName.get(name);
  }

  /** WGSL declaration, ready to be included by any shader. */
  toWgsl(): string {
    const lines = [`struct ${this.structName} {`];
    for (const f of this.fields) {
      const decl = `${f.name}: ${TYPES[f.type].wgsl},`;
      if (f.doc) lines.push(`  /// ${f.doc}`);
      lines.push(`  ${decl.padEnd(34)} // @${f.offset}`);
    }
    lines.push(`};`);
    lines.push(``);
    lines.push(`// Byte size: ${this.byteSize}`);
    return lines.join('\n');
  }
}

export interface UniformWriter {
  floats: Float32Array;
  u32: Uint32Array;
  i32: Int32Array;
}

/** Zero-copy view over a uniform buffer's mapped array. */
export function makeWriter(bytes: number, buffer = new ArrayBuffer(bytes)): UniformWriter {
  return { floats: new Float32Array(buffer), u32: new Uint32Array(buffer), i32: new Int32Array(buffer) };
}

function slot(w: UniformWriter, layout: FieldLayout) {
  const base = layout.offset >> 2;
  return { base, w };
}

export function setField(w: UniformWriter, layout: FieldLayout, value: number | readonly number[] | Float32Array): void {
  const { base } = slot(w, layout);
  if (typeof value === 'number') {
    if (layout.type === 'u32') w.u32[base] = value >>> 0;
    else if (layout.type === 'i32') w.i32[base] = value | 0;
    else w.floats[base] = value;
    // vec3<u32>/vec3<f32> pad slot stays 0
    return;
  }
  const isUint = layout.type === 'vec2u' || layout.type === 'vec3u' || layout.type === 'vec4u';
  for (let i = 0; i < value.length && i < layout.slots; i++) {
    const v = value[i]!;
    if (isUint) w.u32[base + i] = v >>> 0;
    else w.floats[base + i] = v;
  }
}

/** Packs a params object into a writer, in schema order. Missing fields keep their previous value. */
export function pack(w: UniformWriter, schema: UniformSchema, values: Record<string, number | readonly number[] | Float32Array>): void {
  for (const layout of schema.fields) {
    const v = values[layout.name];
    if (v === undefined) continue;
    setField(w, layout, v);
  }
}

function align(v: number, a: number): number {
  return Math.ceil(v / a) * a;
}

/** Explicit padding helper so the WGSL-side offsets are obvious in the schema definition. */
export function pad(n = 1): FieldSpec[] {
  return Array.from({ length: n }, (_, i) => ({ name: `_pad${i}_`, type: 'u32' as FieldType }));
}
