const { performance } = require('perf_hooks');

const float32 = new Float32Array(1024);
for (let i = 0; i < float32.length; i++) float32[i] = Math.random() * 2 - 1;


function test6() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const int16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]))
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }

    const bytes = new Uint8Array(int16.buffer)
    const CHUNK_SIZE = 0x8000;
    const chunks = [];
    for (let j = 0; j < bytes.length; j += CHUNK_SIZE) {
      // Avoid Array.from because older browsers or specific environments might throw RangeError
      // with max call stack size exceeded if the array is huge, but chunks are 32k.
      // But Array.from still adds overhead. Let's see if we can do something faster that is edge compatible.
      // String.fromCharCode.apply(null, chunk) throws in some environments when passing TypedArrays directly
      // The issue description explicitly requests:
      // "BUG-H2 fix: use Array.from + join instead of character-by-character"
    }
  }
  return performance.now() - start;
}
