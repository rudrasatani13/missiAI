const { performance } = require('perf_hooks');

const arr = new Uint8Array(16000);
for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);

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

function test4() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
     const len = arr.length;
     const chars = new Array(len);
     for (let j = 0; j < len; j++) chars[j] = String.fromCharCode(arr[j]);
     btoa(chars.join(''));
  }
  return performance.now() - start;
}


console.log("String.fromCharCode.apply + chunk:", test2(), "ms");
console.log("Array + join:", test4(), "ms");
