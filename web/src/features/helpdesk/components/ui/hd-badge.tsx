interface Props {
  tone?: 'primary' | 'positive' | 'cautionary' | 'negative' | 'solid'
  children: React.ReactNode
  style?: React.CSSProperties
}

export function HdBadge({ tone, children, style }: Props) {
  return (
    <span className={`w-badge${tone ? ` w-badge--${tone}` : ''}`} style={style}>
      {children}
    </span>
  )
}
