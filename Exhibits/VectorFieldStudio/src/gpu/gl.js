/*====================================================================================================================================
                                                        GL.JS
====================================================================================================================================*/
// 🧩 WebGL2 context, shader compilation, texture, framebuffer, and buffer helpers.

export function createContext(canvas, options = {}) {
    const attributes = {
        alpha: false,
        antialias: true,
        depth: true,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
        ...options,
    };
    const gl = canvas.getContext('webgl2', attributes);
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    const floatRenderable = gl.getExtension('EXT_color_buffer_float');
    const halfFloatRenderable = gl.getExtension('EXT_color_buffer_half_float');
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    return {
        gl,
        floatRenderable: Boolean(floatRenderable),
        halfFloatRenderable: Boolean(halfFloatRenderable),
        renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    };
}

export function compileShader(gl, type, source, label) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compilation failed (${label}): ${log}`);
    }
    return shader;
}

export function createProgram(gl, vertexSource, fragmentSource, label = 'program') {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource, `${label} vertex`);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label} fragment`);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Program link failed (${label}): ${log}`);
    }
    const uniforms = new Map();
    const uniform = (name) => {
        if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name));
        return uniforms.get(name);
    };
    return { program, uniform, label };
}

export function createTexture2D(gl, width, height, internalFormat, format, type, filter = gl.LINEAR, data = null, wrap = gl.CLAMP_TO_EDGE) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
}

export function createTexture3D(gl, width, height, depth, internalFormat, format, type, filter = gl.LINEAR, data = null, wrap = gl.REPEAT) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, texture);
    gl.texImage3D(gl.TEXTURE_3D, 0, internalFormat, width, height, depth, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, wrap);
    gl.bindTexture(gl.TEXTURE_3D, null);
    return texture;
}

export function createFramebuffer(gl, textures) {
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const attachments = [];
    textures.forEach((texture, index) => {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + index, gl.TEXTURE_2D, texture, 0);
        attachments.push(gl.COLOR_ATTACHMENT0 + index);
    });
    if (attachments.length > 1) gl.drawBuffers(attachments);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`);
    }
    return framebuffer;
}

export function createFullscreenVAO(gl) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindVertexArray(null);
    return vao;
}

export function createBuffer(gl, target, data, usage = gl.STATIC_DRAW) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(target, buffer);
    gl.bufferData(target, data, usage);
    gl.bindBuffer(target, null);
    return buffer;
}

export function createMeshVAO(gl, program, attributes, indexBuffer = null) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const rawProgram = program.program || program;
    const buffers = [];
    for (const attribute of attributes) {
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, attribute.data, gl.STATIC_DRAW);
        buffers.push(buffer);
        const location = gl.getAttribLocation(rawProgram, attribute.name);
        if (location < 0) continue;
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, attribute.size, gl.FLOAT, false, 0, 0);
    }
    if (indexBuffer) {
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexBuffer, gl.STATIC_DRAW);
        buffers.push(buffer);
    }
    gl.bindVertexArray(null);
    return { vao, buffers };
}

export function pickParticleFormat(gl, floatRenderable, halfFloatRenderable) {
    if (floatRenderable) {
        return { internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, label: 'RGBA32F' };
    }
    if (halfFloatRenderable) {
        return { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, label: 'RGBA16F' };
    }
    return { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, label: 'RGBA8' };
}

export function setViewport(gl, width, height) {
    gl.viewport(0, 0, width, height);
}

export function bindTexture(gl, unit, target, texture) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, texture);
}
