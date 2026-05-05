import type { LifeNode } from '@/types/memory'

interface NodeCardBodyProps {
  node: LifeNode
}

export function NodeCardBody({ node }: NodeCardBodyProps) {
  const confidenceColor =
    node.confidence > 0.7
      ? 'var(--missi-text-primary)'
      : node.confidence >= 0.4
        ? 'var(--missi-text-secondary)'
        : 'var(--missi-text-muted)'

  const visibleTags = node.tags.slice(0, 4)
  const extraTagCount = node.tags.length - 4

  return (
    <>
      {/* Detail text */}
      {node.detail && (
        <p
          style={{
            fontSize: '12px',
            color: 'var(--missi-text-secondary)',
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
                color: 'var(--missi-text-secondary)',
                background: 'var(--missi-nav-active-bg)',
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
                color: 'var(--missi-text-muted)',
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
            color: 'var(--missi-text-muted)',
            flexShrink: 0,
          }}
        >
          {node.source}
        </span>
        <div
          style={{
            flex: 1,
            height: '4px',
            background: 'var(--missi-nav-active-bg)',
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
            color: 'var(--missi-text-muted)',
            flexShrink: 0,
          }}
        >
          {node.accessCount} access{node.accessCount !== 1 ? 'es' : ''}
        </span>
      </div>
    </>
  )
}
