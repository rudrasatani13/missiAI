const katex = require('katex');
try {
  console.log(katex.renderToString("\\text{<img src=1 onerror=alert(1)>}", { throwOnError: false }));
} catch (e) {
  console.error(e);
}
