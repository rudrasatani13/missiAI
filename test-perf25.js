const { performance } = require('perf_hooks');

const arr = new Uint8Array(16000);
for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);

function test1() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const chars = new Array(arr.length);
    for (let j = 0; j < arr.length; j++) {
       chars[j] = String.fromCharCode(arr[j]);
    }
    btoa(chars.join(""));
  }
  return performance.now() - start;
}

function test2() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    btoa(Array.from(arr, (b) => String.fromCharCode(b)).join(""));
  }
  return performance.now() - start;
}

console.log("Array + loop:", test1(), "ms");
console.log("Array.from + map:", test2(), "ms");
