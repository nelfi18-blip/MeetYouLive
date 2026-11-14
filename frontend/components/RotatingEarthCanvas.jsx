"use client";

import { useEffect, useRef } from "react";
import styles from "./ExploreCarousel3D.module.css";

// A very small WebGL sphere renderer. It projects the existing local Earth
// photograph onto a spherical surface; continents move across the face as
// longitude changes. No remote assets, tracking, extra packages or 2D bobbing.
// CSS keeps the original photo visible if WebGL is unavailable on a device.
const VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = (aPosition + 1.0) * 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uEarth;
uniform float uLongitude;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float radius2 = dot(p,p);
  if (radius2 >= 1.0) discard;

  // Front hemisphere and a rotating meridian in spherical coordinates.
  float depth = sqrt(1.0 - radius2);
  float latitude = asin(clamp(p.y, -1.0, 1.0));
  float longitude = atan(p.x, depth) + uLongitude;
  // The approved front-facing globe image is projected onto both
  // hemispheres. It is NOT a full equirectangular map, so the rear
  // hemisphere repeats; this is a lightweight visual approximation.
  vec2 photoUv = vec2(
    0.5 + 0.44 * sin(longitude) * cos(latitude),
    0.5 + 0.44 * sin(latitude)
  );
  vec3 earth = texture2D(uEarth, photoUv).rgb;

  float illumination = max(0.0, dot(normalize(vec3(p,depth)), normalize(vec3(-0.38,0.47,0.78))));
  earth *= 0.66 + 0.37 * illumination;
  float rim = pow(1.0 - depth, 3.0);
  earth += vec3(0.08,0.42,0.69) * rim * 0.56;
  float alpha = 1.0 - smoothstep(0.975, 1.0, sqrt(radius2));
  gl_FragColor = vec4(earth, alpha);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function RotatingEarthCanvas({ paused = false, reducedMotion = false }) {
  const canvasRef = useRef(null);
  const shouldRotateRef = useRef(!paused && !reducedMotion);

  useEffect(() => {
    shouldRotateRef.current = !paused && !reducedMotion;
  }, [paused, reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    // Context may be disabled by the user or unavailable in an older WebView.
    const gl = canvas.getContext("webgl", {
      alpha: true, antialias: false, depth: false,
      stencil: false, premultipliedAlpha: false,
      preserveDrawingBuffer: false, powerPreference: "low-power",
    });
    if (!gl) return undefined;
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vertex || !fragment) {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      return undefined;
    }
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return undefined;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return undefined;
    }

    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!buffer || !texture) {
      if (buffer) gl.deleteBuffer(buffer);
      if (texture) gl.deleteTexture(texture);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return undefined;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1,
    ]), gl.STATIC_DRAW);
    const attrib = gl.getAttribLocation(program, "aPosition");
    const lonLoc = gl.getUniformLocation(program, "uLongitude");
    const earthLoc = gl.getUniformLocation(program, "uEarth");
    const image = new Image();
    let disposed = false;
    let frameId = 0;
    let lastTime = 0;
    let lastDraw = 0;
    let longitude = 0;
    let ready = false;

    function draw(now) {
      if (disposed || !ready) return;
      // Reduce GPU work while preserving an observable, smooth horizontal turn.
      if (now - lastDraw >= 33) {
        if (lastTime && shouldRotateRef.current && document.visibilityState === "visible") {
          const delta = Math.min(80, now - lastTime);
          longitude = (longitude + delta * (Math.PI * 2 / 34000)) % (Math.PI * 2);
        }
        lastDraw = now;
        gl.useProgram(program);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(attrib);
        gl.vertexAttribPointer(attrib, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(earthLoc, 0);
        gl.uniform1f(lonLoc, longitude);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      lastTime = now;
      frameId = requestAnimationFrame(draw);
    }

    image.onload = () => {
      if (disposed) return;
      const side = Math.min(640, Math.max(192, Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 1.5))));
      canvas.width = side;
      canvas.height = side;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      ready = true;
      canvas.style.opacity = "1";
      frameId = requestAnimationFrame(draw);
    };
    image.onerror = () => { /* Static local photo remains visible. */ };
    image.src = "/universe/earth-photographic.webp";

    return () => {
      disposed = true;
      image.onload = null;
      image.onerror = null;
      cancelAnimationFrame(frameId);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.universeGlobeCanvas} aria-hidden="true" />;
}
