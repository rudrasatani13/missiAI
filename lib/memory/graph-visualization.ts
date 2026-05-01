import type { LifeNode } from '@/types/memory'

export interface MemoryGraphLink {
  source: string
  target: string
  value: number
}

export interface MemoryGraphRenderNode extends LifeNode {
  val: number
}

export interface MemoryGraphData {
  nodes: MemoryGraphRenderNode[]
  links: MemoryGraphLink[]
}

export interface MemoryGraphRenderSettings {
  linkDirectionalParticles: number
  nodeResolution: number
}

const LARGE_GRAPH_NODE_THRESHOLD = 300
const LARGE_GRAPH_LINK_THRESHOLD = 4_000

export function buildMemoryGraphData(nodes: LifeNode[]): MemoryGraphData {
  const links: MemoryGraphLink[] = []
  const nodeTagArrays = nodes.map((node) => node.tags)
  const nodeTagSets = nodeTagArrays.map((tags) => new Set(tags))
  const nodePeopleArrays = nodes.map((node) => node.people)
  const nodePeopleSets = nodePeopleArrays.map((people) => new Set(people))

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const nodeTags = nodeTagArrays[i]
    const nodeTagSet = nodeTagSets[i]
    const nodePeople = nodePeopleArrays[i]
    const nodePeopleSet = nodePeopleSets[i]

    for (let j = i + 1; j < nodes.length; j++) {
      const otherNode = nodes[j]
      let linkValue = node.category === otherNode.category ? 0.5 : 0

      const otherTags = nodeTagArrays[j]
      const otherTagSet = nodeTagSets[j]
      const shorterTags = nodeTags.length <= otherTags.length ? nodeTags : otherTags
      const longerTagSet = nodeTags.length <= otherTags.length ? otherTagSet : nodeTagSet
      for (let tagIndex = 0; tagIndex < shorterTags.length; tagIndex++) {
        if (longerTagSet.has(shorterTags[tagIndex])) {
          linkValue += 2
        }
      }

      const otherPeople = nodePeopleArrays[j]
      const otherPeopleSet = nodePeopleSets[j]
      const shorterPeople = nodePeople.length <= otherPeople.length ? nodePeople : otherPeople
      const longerPeopleSet = nodePeople.length <= otherPeople.length ? otherPeopleSet : nodePeopleSet
      for (let personIndex = 0; personIndex < shorterPeople.length; personIndex++) {
        if (longerPeopleSet.has(shorterPeople[personIndex])) {
          linkValue += 3
        }
      }

      if (linkValue > 0) {
        links.push({
          source: node.id,
          target: otherNode.id,
          value: linkValue,
        })
      }
    }
  }

  return {
    nodes: nodes.map((node) => ({
      ...node,
      val: ((node.emotionalWeight || 0.5) + (node.confidence || 0.5)) * 5,
    })),
    links,
  }
}

export function getMemoryGraphRenderSettings(
  nodeCount: number,
  linkCount: number,
): MemoryGraphRenderSettings {
  const isLargeGraph =
    nodeCount >= LARGE_GRAPH_NODE_THRESHOLD || linkCount >= LARGE_GRAPH_LINK_THRESHOLD

  return {
    linkDirectionalParticles: isLargeGraph ? 0 : 1,
    nodeResolution: isLargeGraph ? 16 : 32,
  }
}
