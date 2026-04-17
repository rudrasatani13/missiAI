const { performance } = require('perf_hooks');

const float32 = new Float32Array(1024);
for (let i = 0; i < float32.length; i++) float32[i] = Math.random() * 2 - 1;

function test1() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const int16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]))
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }

    const bytes = new Uint8Array(int16.buffer)
    const b64 = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))
  }
  return performance.now() - start;
}


function test3() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const int16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]))
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }

    const bytes = new Uint8Array(int16.buffer)
    const len = bytes.byteLength;
    let binary = '';
    for (let j = 0; j < len; j++) binary += String.fromCharCode(bytes[j]);
    const b64 = btoa(binary);
  }
  return performance.now() - start;
}

function test4() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const int16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]))
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }

    const bytes = new Uint8Array(int16.buffer)
    const b64 = btoa(
      Array.from(bytes)
        .map((b) => String.fromCharCode(b))
        .join("")
    )
  }
  return performance.now() - start;
}

function test5() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const int16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]))
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }

    const bytes = new Uint8Array(int16.buffer)
    const chunks = [];
    for (let j = 0; j < bytes.length; j += 8192) {
      chunks.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(j, j + 8192))));
    }
    const b64 = btoa(chunks.join(""));
  }
  return performance.now() - start;
}

console.log("Array.from + join:", test1(), "ms");
console.log("+= String.fromCharCode (cached len):", test3(), "ms");
console.log("Array.from + map + join:", test4(), "ms");
console.log("String.fromCharCode.apply + chunk + Array.from:", test5(), "ms");
