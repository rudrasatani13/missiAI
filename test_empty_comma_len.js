const contents = [];
const bytes1 = JSON.stringify(contents).length;

const modelEntry = { role: "model" };
const userEntry = { role: "user" };
contents.push(modelEntry);
contents.push(userEntry);

const bytes2 = JSON.stringify(contents).length;

const addedBytes1 = JSON.stringify(modelEntry).length + JSON.stringify(userEntry).length + 2;
const addedBytes2 = JSON.stringify(modelEntry).length + JSON.stringify(userEntry).length + 1;

console.log("Empty initial array addedBytes expected:", bytes2 - bytes1);
console.log("Empty initial array addedBytes1 (if we used +2):", addedBytes1);
console.log("Empty initial array addedBytes2 (if we used +1):", addedBytes2);
