const float32 = new Float32Array([1, 0, -1]);

const int16 = new Int16Array(float32.length)
for (let i = 0; i < float32.length; i++) {
  const s = Math.max(-1, Math.min(1, float32[i]))
  int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
}
const bytes = new Uint8Array(int16.buffer)
const currentStr = Array.from(bytes, (b) => String.fromCharCode(b)).join("");

let stringConcat = "";
for (let i = 0; i < bytes.length; i++) {
   stringConcat += String.fromCharCode(bytes[i]);
}

const chunkStrArr = [];
const chunk = 8192;
for (let i = 0; i < bytes.length; i += chunk) {
  chunkStrArr.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
}
const chunkStr = chunkStrArr.join('');

const b64_1 = btoa(currentStr);
const b64_2 = btoa(stringConcat);
const b64_3 = btoa(chunkStr);

console.log(b64_1 === b64_2 && b64_2 === b64_3);

let stringConcatOld = "";
for (let i = 0; i < bytes.length; i++) {
   stringConcatOld += String.fromCharCode(bytes[i]);
}
