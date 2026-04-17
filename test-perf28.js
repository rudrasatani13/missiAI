const { performance } = require('perf_hooks');

const arr = new Uint8Array(16000);
for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);


function test3() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const chunk = 32768;
    const chunks = [];
    for (let j = 0; j < arr.length; j += chunk) {
      chunks.push(String.fromCharCode.apply(null, Array.from(arr.subarray(j, j + chunk))));
    }
    btoa(chunks.join(""));
  }
  return performance.now() - start;
}

function test5() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const chars = [];
    const len = arr.length;
    for (let j = 0; j < len; j++) {
      chars.push(String.fromCharCode(arr[j]));
    }
    btoa(chars.join(""));
  }
  return performance.now() - start;
}

console.log("String.fromCharCode.apply(Array.from) + chunk:", test3(), "ms");
console.log("Array.push + loop:", test5(), "ms");
