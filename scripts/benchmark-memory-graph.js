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

  const nodeTagArrays = nodes.map(n => n.tags || []);
  const nodeTagSets = nodeTagArrays.map(tags => new Set(tags));
  const nodePeopleArrays = nodes.map(n => n.people || []);
  const nodePeopleSets = nodePeopleArrays.map(people => new Set(people));

  for (let i = 0; i < nodes.length; i++) {
    const n1 = nodes[i];
    const n1Tags = nodeTagArrays[i];
    const n1TagSet = nodeTagSets[i];
    const n1People = nodePeopleArrays[i];
    const n1PeopleSet = nodePeopleSets[i];

    for (let j = i + 1; j < nodes.length; j++) {
      const n2 = nodes[j];

      let linkValue = n1.category === n2.category ? 0.5 : 0;

      // Link by shared tags
      const n2Tags = nodeTagArrays[j];
      const n2TagsSet = nodeTagSets[j];
      const shorterTags = n1Tags.length <= n2Tags.length ? n1Tags : n2Tags;
      const longerTagSet = n1Tags.length <= n2Tags.length ? n2TagsSet : n1TagSet;
      for (let t = 0; t < shorterTags.length; t++) {
        if (longerTagSet.has(shorterTags[t])) linkValue += 2;
      }

      // Link by shared people
      const n2People = nodePeopleArrays[j];
      const n2PeopleSet = nodePeopleSets[j];
      const shorterPeople = n1People.length <= n2People.length ? n1People : n2People;
      const longerPeopleSet = n1People.length <= n2People.length ? n2PeopleSet : n1PeopleSet;
      for (let p = 0; p < shorterPeople.length; p++) {
        if (longerPeopleSet.has(shorterPeople[p])) linkValue += 3;
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
