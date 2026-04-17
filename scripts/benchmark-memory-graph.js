const { performance } = require('perf_hooks');

// Generate mock nodes
const generateNodes = (count) => {
  const nodes = [];
  const allTags = Array.from({length: 100}, (_, i) => `tag${i}`);
  const allPeople = Array.from({length: 50}, (_, i) => `person${i}`);
  const categories = ['person', 'goal', 'habit', 'event', 'emotion', 'place', 'preference', 'skill', 'belief', 'relationship'];

  for (let i = 0; i < count; i++) {
    // Pick 10 random tags
    const tags = [];
    for (let t=0; t<20; t++) {
      tags.push(allTags[Math.floor(Math.random() * allTags.length)]);
    }

    // Pick 5 random people
    const people = [];
    for (let p=0; p<10; p++) {
      people.push(allPeople[Math.floor(Math.random() * allPeople.length)]);
    }

    nodes.push({
      id: `node${i}`,
      category: categories[Math.floor(Math.random() * categories.length)],
      tags: [...new Set(tags)],
      people: [...new Set(people)],
      emotionalWeight: Math.random(),
      confidence: Math.random()
    });
  }
  return nodes;
};

const nodes = generateNodes(2000);

const testBaseline = () => {
  const links = [];
  const start = performance.now();

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const n1 = nodes[i];
      const n2 = nodes[j];

      let linkValue = 0;

      // Link by shared tags
      let sharedTags = 0;
      n1.tags.forEach(t => { if (n2.tags.includes(t)) sharedTags++; });
      linkValue += sharedTags * 2;

      // Link by shared people
      let sharedPeople = 0;
      n1.people.forEach(p => { if (n2.people.includes(p)) sharedPeople++; });
      linkValue += sharedPeople * 3;

      // Link weakly by category
      if (n1.category === n2.category) {
        linkValue += 0.5;
      }

      if (linkValue > 0) {
        links.push({
          source: n1.id,
          target: n2.id,
          value: linkValue
        });
      }
    }
  }

  const end = performance.now();
  return { time: end - start, linksCount: links.length };
};

const testOptimized = () => {
  const links = [];
  const start = performance.now();

  const nodeTagsSets = nodes.map(n => new Set(n.tags || []));
  const nodePeopleSets = nodes.map(n => new Set(n.people || []));

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const n1 = nodes[i];
      const n2 = nodes[j];

      let linkValue = 0;

      // Link by shared tags
      let sharedTags = 0;
      const n2Tags = nodeTagsSets[j];
      n1.tags.forEach(t => { if (n2Tags.has(t)) sharedTags++; });
      linkValue += sharedTags * 2;

      // Link by shared people
      let sharedPeople = 0;
      const n2People = nodePeopleSets[j];
      n1.people.forEach(p => { if (n2People.has(p)) sharedPeople++; });
      linkValue += sharedPeople * 3;

      // Link weakly by category
      if (n1.category === n2.category) {
        linkValue += 0.5;
      }

      if (linkValue > 0) {
        links.push({
          source: n1.id,
          target: n2.id,
          value: linkValue
        });
      }
    }
  }

  const end = performance.now();
  return { time: end - start, linksCount: links.length };
};

console.log("Running baseline...");
const baselineResult = testBaseline();
console.log(`Baseline time: ${baselineResult.time.toFixed(2)}ms (Links: ${baselineResult.linksCount})`);

console.log("Running optimized...");
const optimizedResult = testOptimized();
console.log(`Optimized time: ${optimizedResult.time.toFixed(2)}ms (Links: ${optimizedResult.linksCount})`);

const improvement = ((baselineResult.time - optimizedResult.time) / baselineResult.time) * 100;
console.log(`Improvement: ${improvement.toFixed(2)}%`);
