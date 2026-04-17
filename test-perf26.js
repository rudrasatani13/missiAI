const { performance } = require('perf_hooks');

const arr = new Uint8Array(16000);
for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);

function test2() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    btoa(Array.from(arr, (b) => String.fromCharCode(b)).join(""));
  }
  return performance.now() - start;
}

function test3() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const chunk = 8192;
    let str = "";
    for (let j = 0; j < arr.length; j += chunk) {
      // Use Array.from for the chunk and String.fromCharCode.apply on it.
      str += String.fromCharCode.apply(null, Array.from(arr.subarray(j, j + chunk)));
    }
    btoa(str);
  }
  return performance.now() - start;
}

function test4() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    let str = "";
    const len = arr.byteLength;
    for (let j = 0; j < len; j++) {
      str += String.fromCharCode(arr[j]);
    }
    btoa(str);
  }
  return performance.now() - start;
}

console.log("Array.from + map:", test2(), "ms");
console.log("String.fromCharCode.apply(Array.from) + chunk:", test3(), "ms");
console.log("+= String.fromCharCode (cached len):", test4(), "ms");
