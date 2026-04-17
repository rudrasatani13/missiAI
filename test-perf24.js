const float32 = new Float32Array(1024);
for (let i = 0; i < float32.length; i++) float32[i] = Math.random() * 2 - 1;
const int16 = new Int16Array(float32.length)
for (let i = 0; i < float32.length; i++) {
  const s = Math.max(-1, Math.min(1, float32[i]))
  int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
}
const bytes = new Uint8Array(int16.buffer)
const b64_old = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))

let binary = "";
const len = bytes.byteLength;
for (let i = 0; i < len; i++) {
  binary += String.fromCharCode(bytes[i]);
}
const b64_new = btoa(binary)

console.log(b64_old === b64_new)
