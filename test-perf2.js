const { performance } = require('perf_hooks');

const arr = new Uint8Array(16000);
for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);

function test1() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    btoa(Array.from(arr, (b) => String.fromCharCode(b)).join(""));
  }
  return performance.now() - start;
}

function test2() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const chunk = 8192;
    let str = "";
    for (let j = 0; j < arr.length; j += chunk) {
      str += String.fromCharCode.apply(null, arr.subarray(j, j + chunk));
    }
    btoa(str);
  }
  return performance.now() - start;
}

function test3() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    let str = "";
    for(let j = 0; j < arr.length; j++) {
       str += String.fromCharCode(arr[j]);
    }
    btoa(str);
  }
  return performance.now() - start;
}

console.log("Array.from + join:", test1(), "ms");
console.log("String.fromCharCode.apply + chunk:", test2(), "ms");
console.log("+= String.fromCharCode:", test3(), "ms");
