const { performance } = require('perf_hooks');

const float32 = new Float32Array(1024);
for (let i = 0; i < float32.length; i++) float32[i] = Math.random() * 2 - 1;

function test2() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const int16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]))
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }

    const bytes = new Uint8Array(int16.buffer)
    const chunk = 8192;
    let str = "";
    for (let j = 0; j < bytes.length; j += chunk) {
      str += String.fromCharCode.apply(null, Array.from(bytes.subarray(j, j + chunk)));
    }
    const b64 = btoa(str);
  }
  return performance.now() - start;
}

console.log("String.fromCharCode.apply + chunk + Array.from:", test2(), "ms");
