const contents = [{ role: "user", parts: [{ text: "hello" }] }];
const bytes1 = JSON.stringify(contents).length;

const modelEntry = { role: "model", parts: [{ functionCall: { name: "test", args: {} } }] };
const userEntry = { role: "user", parts: [{ functionResponse: { name: "test", response: { result: "ok" } } }] };

contents.push(modelEntry);
contents.push(userEntry);

const bytes2 = JSON.stringify(contents).length;

console.log("bytes1:", bytes1);
console.log("modelEntry:", JSON.stringify(modelEntry).length);
console.log("userEntry:", JSON.stringify(userEntry).length);
console.log("bytes2:", bytes2);
console.log("diff:", bytes2 - bytes1);
console.log("sum of individual:", JSON.stringify(modelEntry).length + JSON.stringify(userEntry).length);
