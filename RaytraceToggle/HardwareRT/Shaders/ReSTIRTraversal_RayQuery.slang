//============================================================================================================================================
//  ReSTIRTraversal_RayQuery.slang — HARDWARE (RT-core) traversal for the ReSTIR kernel via VK_KHR_ray_query
//============================================================================================================================================
//  Roadmap #31. This file provides RayQuery-backed implementations of the ONLY two traversal entry points the kernel
//  uses — TraceTraversal() and TraceTraversalOccluded() — so the entire rest of ReSTIRViewport.slang (TraceScene,
//  TraceShadow, material resolve, the reservoirs) is UNCHANGED. It is compiled in only when FRONTIER_RAYQUERY is
//  defined; otherwise the software CWBVH versions in ReSTIRViewport.slang are used.
//
//  Why RayQuery (inline) and not a ray-tracing pipeline (SBT): this kernel is ONE compute dispatch and every shading
//  decision already lives in it. VK_KHR_ray_query lets a compute shader trace against the hardware acceleration
//  structure inline (rayQueryEXT), keeping all data in registers — no ray-gen/closest-hit/miss stages, no SBT, no
//  payload round-trip through memory. On simple-to-moderate scenes inline ray query is the fastest of the three
//  backends for exactly this reason, and it is a drop-in for the existing compute traversal. The SBT pipeline
//  (VK_KHR_ray_tracing_pipeline) is the later high tier (RayTracingTierCategory::Pipeline); it is NOT needed here.
//
//  Contract this file must honour (so nothing downstream changes):
//    • TraversalResult.instance   = the TOP-LEVEL instance row  → we set it as the TLAS instance CUSTOM INDEX at build.
//    • TraversalResult.primitive  = the LOCAL triangle index inside that instance's BLAS geometry
//                                   → rayQueryGetIntersectionPrimitiveIndexEXT returns exactly that.
//    • With no instances resident (TlasInstanceCount == 0) the AS is one BLAS of the world-space blob and one identity
//      TLAS instance with custom index 0; then FlatPrimitiveOf() returns result.primitive directly — the flat index —
//      which is what a single-geometry BLAS's primitive index already is. Both cases therefore agree with the
//      software path's FlatPrimitiveOf()/InstanceNormalToWorld() without a branch here.
//    • Alpha cut-outs: geometry is built OPAQUE in the AS, so a RayQuery closest hit can land on a cut-out texel. The
//      caller (TraceScene / TraceShadow) already re-traces from just past the hit through kAlphaMaskRetraceLimit
//      passes — identical to the software path — so we simply return the closest hit and let that loop run.
//
//  Required at compile: #version 460, GL_EXT_ray_query, target SPIR-V 1.4 (spv1.4), Vulkan 1.2 env, buffer_reference
//  not needed (the AS is a descriptor). See RayQueryHardwarePath.md for the exact glslc invocation.
//============================================================================================================================================
#ifdef FRONTIER_RAYQUERY

#extension GL_EXT_ray_query : require

// The TLAS lives in its OWN descriptor set (set 1) because set 0 is fully packed (bindings 0..31, the bindless
//    Textures[] must remain the last binding of its set). The host only creates + binds set 1 when the resolved tier
//    is RayQuery or higher, so a software-tier run never references it.
layout(set = 1, binding = 0) uniform accelerationStructureEXT Tlas;

// Closest hit. Signature is byte-for-byte the software one (rD, the reciprocal direction, is unused by the hardware
//    walk but kept so every call site is untouched).
TraversalResult TraceTraversal(vec3 origin, vec3 dir, vec3 rD, float tmax)
{
    TraversalResult result;
    result.t = kInf; result.primitive = 0xFFFFFFFFu; result.instance = 0xFFFFFFFFu; result.valid = false;

    rayQueryEXT rq;
    // tMin = 0: the callers already offset the origin by kEps where a self-hit is possible, and TraceScene rejects
    //    r.t <= kEps itself — matching the software path exactly rather than silently skipping near hits here.
    rayQueryInitializeEXT(rq, Tlas, gl_RayFlagsOpaqueEXT, 0xFFu, origin, 0.0, dir, tmax);
    while (rayQueryProceedEXT(rq)) { }   // all geometry is opaque in the AS → no candidate handling needed

    if (rayQueryGetIntersectionTypeEXT(rq, true) == gl_RayQueryCommittedIntersectionTriangleEXT)
    {
        result.t         = rayQueryGetIntersectionTEXT(rq, true);
        result.primitive = rayQueryGetIntersectionPrimitiveIndexEXT(rq, true);        // LOCAL triangle index in the BLAS
        result.instance  = uint(rayQueryGetIntersectionInstanceCustomIndexEXT(rq, true)); // = top-level instance row
        result.valid     = true;
    }
    return result;
}

// Any-hit occlusion. Terminate on the first hit — we only need existence, not the nearest.
bool TraceTraversalOccluded(vec3 origin, vec3 dir, vec3 rD, float tmax)
{
    rayQueryEXT rq;
    rayQueryInitializeEXT(rq, Tlas,
        gl_RayFlagsOpaqueEXT | gl_RayFlagsTerminateOnFirstHitEXT,
        0xFFu, origin, 0.0, dir, tmax);
    while (rayQueryProceedEXT(rq)) { }
    return rayQueryGetIntersectionTypeEXT(rq, true) != gl_RayQueryCommittedIntersectionNoneEXT;
}

#endif // FRONTIER_RAYQUERY
