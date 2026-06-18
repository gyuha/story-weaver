const ICONS: Record<string, string> = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  pencil: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z',
  like: 'M7 10v11M2 13v6a2 2 0 0 0 2 2h13.3a2 2 0 0 0 2-1.7l1.3-8a2 2 0 0 0-2-2.3H14V4a2 2 0 0 0-2-2l-3 8H7',
  dislike: 'M17 14V3M22 11V5a2 2 0 0 0-2-2H6.7a2 2 0 0 0-2 1.7l-1.3 8A2 2 0 0 0 5.4 15H10v5a2 2 0 0 0 2 2l3-8h2',
  comment: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 9.5 9.5 0 0 1-4-.9L3 21l1.3-3.8A8.2 8.2 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  chevronDown: 'M6 9l6 6 6-6',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  chevronsLeft: 'M11 18l-6-6 6-6M18 18l-6-6 6-6',
  chevronsRight: 'M13 18l6-6-6-6M6 18l6-6-6-6',
  x: 'M18 6 6 18M6 6l12 12',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  lock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2Z|M7 11V7a5 5 0 0 1 10 0v4',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z|m22 6-10 7L2 6',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
  key: 'M21 2l-2 2m-7.6 7.6a5 5 0 1 0-1 1L13 12l2 2 2-2 2 2 3-3-5-5Z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Z|M15 8a4 4 0 0 1 0 8|M19 5a8 8 0 0 1 0 14',
  help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01|M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  chat: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 9.5 9.5 0 0 1-4-.9L3 21l1.3-3.8A8.2 8.2 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z',
  card: 'M2 7h20v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7Zm0 4h20|M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2',
  bug: 'M8 6V4a4 4 0 0 1 8 0v2M5 10h14M6 10v5a6 6 0 0 0 12 0v-5M3 13h3M18 13h3M3 18h3.5M17.5 18H21M12 10v11',
  bulb: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2Z',
  coffee: 'M18 8h1a3 3 0 0 1 0 6h-1M4 8h14v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8ZM7 2v2M11 2v2M15 2v2',
  home: 'M3 11l9-8 9 8M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  reply: 'M9 17l-5-5 5-5M4 12h11a5 5 0 0 1 5 5v3',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M22 11.1V12a10 10 0 1 1-5.9-9.1|M22 4 12 14.01l-3-3',
  plus: 'M12 5v14M5 12h14',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  pin: 'M12 17v5M9 10.8V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6.8a3 3 0 0 0 .9 2.1l.7.8a1 1 0 0 1-.7 1.5H7.1a1 1 0 0 1-.7-1.5l.7-.8a3 3 0 0 0 .9-2.1Z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  dashboard: 'M3 3h8v8H3V3ZM13 3h8v5h-8V3ZM13 12h8v9h-8v-9ZM3 15h8v6H3v-6Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z|M12 7v5l3 2',
  sort: 'M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM12 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
}

interface HdIconProps {
  name: string
  size?: number
  stroke?: number
  fill?: boolean
  style?: React.CSSProperties
  className?: string
}

export function HdIcon({ name, size = 20, stroke = 1.8, fill = false, style, className }: HdIconProps) {
  const d = ICONS[name]
  if (!d) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: 'block', flexShrink: 0, ...style }}
      className={className}
    >
      {d.split('|').map((path, i) => (
        <path
          key={i}
          d={path}
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={fill ? 'currentColor' : 'none'}
        />
      ))}
    </svg>
  )
}
