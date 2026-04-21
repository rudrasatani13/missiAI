import type { LifeNode } from '@/types/memory'

interface NodeCardBodyProps {
  node: LifeNode
}

export function NodeCardBody({ node }: NodeCardBodyProps) {
  const confidenceColor =
    node.confidence > 0.7
      ? 'rgba(255,255,255,0.9)'
      : node.confidence >= 0.4
        ? 'rgba(255,255,255,0.5)'
        : 'rgba(255,255,255,0.2)'

  const visibleTags = node.tags.slice(0, 4)
  const extraTagCount = node.tags.length - 4

  return (
    <>
      {/* Detail text */}
      {node.detail && (
        <p
          style={{
            fontSize: '12px',
            color: 'rgba(255,255,255,0.5)',
            margin: 0,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            lineHeight: '1.5',
          }}
        >
          {node.detail}
        </p>
      )}

      {/* Tags */}
      {node.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {visibleTags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: '10px',
                color: 'rgba(255,255,255,0.5)',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '999px',
                padding: '2px 8px',
              }}
            >
              {tag}
            </span>
          ))}
          {extraTagCount > 0 && (
            <span
              style={{
                fontSize: '10px',
                color: 'rgba(255,255,255,0.35)',
                padding: '2px 4px',
              }}
            >
              +{extraTagCount} more
            </span>
          )}
        </div>
      )}

      {/* Bottom row: source + confidence bar + access count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          style={{
            fontSize: '10px',
            color: 'rgba(255,255,255,0.3)',
            flexShrink: 0,
          }}
        >
          {node.source}
        </span>
        <div
          style={{
            flex: 1,
            height: '4px',
            background: 'rgba(255,255,255,0.08)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${node.confidence * 100}%`,
              background: confidenceColor,
              borderRadius: '2px',
              transition: 'width 0.3s',
            }}
          />
        </div>
        <span
          style={{
            fontSize: '10px',
            color: 'rgba(255,255,255,0.3)',
            flexShrink: 0,
          }}
        >
          {node.accessCount} access{node.accessCount !== 1 ? 'es' : ''}
        </span>
      </div>
    </>
  )
}
