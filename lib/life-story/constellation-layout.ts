import { LifeGraph, LifeNode, MemoryCategory } from '@/types/memory'
import { ConstellationGrouping, ConstellationCluster } from '@/types/life-story'

const CATEGORIES: MemoryCategory[] = [
  'person', 'goal', 'habit', 'preference', 'event',
  'emotion', 'skill', 'place', 'belief', 'relationship',
]

function jitter() {
  return (Math.random() - 0.5) * 0.15
}

function processByCategory(graph: LifeGraph): ConstellationCluster[] {
  const clusters: ConstellationCluster[] = CATEGORIES.map((cat, i) => {
    const angle = (i / CATEGORIES.length) * Math.PI * 2
    // Place centers in a circle around the center (0.5, 0.5)
    const radius = 0.35
    return {
      label: cat,
      nodeIds: [],
      centerX: 0.5 + Math.cos(angle) * radius,
      centerY: 0.5 + Math.sin(angle) * radius,
    }
  })

  for (const node of graph.nodes) {
    const cluster = clusters.find(c => c.label === node.category)
    if (cluster) {
      cluster.nodeIds.push(node.id)
    }
  }

  return clusters.filter(c => c.nodeIds.length > 0)
}

function processByTime(graph: LifeGraph): ConstellationCluster[] {
  const timeBuckets = new Map<string, string[]>()
  
  if (graph.nodes.length === 0) return []

  let minTime = graph.nodes[0].createdAt
  let maxTime = graph.nodes[0].createdAt
  for (const node of graph.nodes) {
    if (node.createdAt < minTime) minTime = node.createdAt
    if (node.createdAt > maxTime) maxTime = node.createdAt
  }

  const span = maxTime - minTime
  const numBuckets = Math.max(1, Math.min(8, Math.ceil(span / (180 * 24 * 60 * 60 * 1000)))) // Roughly 6-month buckets

  // Initialize buckets
  const clusters: ConstellationCluster[] = []
  for (let i = 0; i < numBuckets; i++) {
    const bucketStart = minTime + (span / numBuckets) * i
    const d = new Date(bucketStart)
    clusters.push({
      label: `${d.toLocaleString('default', { month: 'short' })} '${d.getFullYear().toString().slice(2)}`,
      nodeIds: [],
      centerX: 0.1 + (0.8 * (i / Math.max(1, numBuckets - 1))),
      centerY: 0.5, // Will dynamically distribute nodes vertically by emotion in the UI instead of here, or center here.
    })
  }

  for (const node of graph.nodes) {
    let bucketIndex = Math.floor(((node.createdAt - minTime) / Math.max(span, 1)) * numBuckets)
    if (bucketIndex >= numBuckets) bucketIndex = numBuckets - 1
    clusters[bucketIndex].nodeIds.push(node.id)
  }

  return clusters.filter(c => c.nodeIds.length > 0)
}

function processByEmotion(graph: LifeGraph): ConstellationCluster[] {
  const buckets = [
    { label: 'High Emotion', min: 0.7, max: 1.0, centerY: 0.2, nodeIds: [] as string[] },
    { label: 'Neutral Emotion', min: 0.4, max: 0.699, centerY: 0.5, nodeIds: [] as string[] },
    { label: 'Low Emotion', min: 0.0, max: 0.399, centerY: 0.8, nodeIds: [] as string[] },
  ]

  for (const node of graph.nodes) {
    const w = node.emotionalWeight || 0.5
    for (const b of buckets) {
      if (w >= b.min && w <= b.max) {
        b.nodeIds.push(node.id)
        break
      }
    }
  }

  return buckets.filter(b => b.nodeIds.length > 0).map(b => ({
    label: b.label,
    nodeIds: b.nodeIds,
    centerX: 0.5,
    centerY: b.centerY
  }))
}

function processByPeople(graph: LifeGraph): ConstellationCluster[] {
  const peopleCounts = new Map<string, number>()
  for (const node of graph.nodes) {
    for (const p of node.people) {
      peopleCounts.set(p, (peopleCounts.get(p) || 0) + 1)
    }
  }

  const topPeople = Array.from(peopleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8) // max 8 people clusters
    .map(e => e[0])

  const clusters: ConstellationCluster[] = topPeople.map((person, i) => {
    const angle = (i / Math.max(1, topPeople.length)) * Math.PI * 2
    const radius = 0.35
    return {
      label: person,
      nodeIds: [],
      centerX: 0.5 + Math.cos(angle) * radius,
      centerY: 0.5 + Math.sin(angle) * radius,
    }
  })

  // add nodes to clusters
  for (const node of graph.nodes) {
    const matchedPeople = node.people.filter(p => topPeople.includes(p))
    if (matchedPeople.length > 0) {
      // Just add it to the first matching person cluster for simplicity of anchoring
      const cluster = clusters.find(c => c.label === matchedPeople[0])
      if (cluster) cluster.nodeIds.push(node.id)
    }
  }

  return clusters.filter(c => c.nodeIds.length > 0)
}

export function computeConstellationLayout(graph: LifeGraph, mode: ConstellationGrouping['mode']): ConstellationGrouping {
  let clusters: ConstellationCluster[] = []

  switch (mode) {
    case 'by_category':
      clusters = processByCategory(graph)
      break
    case 'by_time':
      clusters = processByTime(graph)
      break
    case 'by_emotion':
      clusters = processByEmotion(graph)
      break
    case 'by_people':
      clusters = processByPeople(graph)
      break
  }

  return {
    mode,
    clusters
  }
}
