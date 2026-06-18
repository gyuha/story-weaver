const COLORS = ['#0066FF', '#00BF40', '#FF9200', '#9747FF', '#FF3B3B', '#00B2B2', '#7B61FF', '#E85D9B']

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

interface Props {
  name?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

export function HdAvatar({ name = '?', size = 'md' }: Props) {
  const color = COLORS[hash(name) % COLORS.length]
  return (
    <span
      className={`w-avatar w-avatar--${size}`}
      style={{ background: color + '1F', color }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
