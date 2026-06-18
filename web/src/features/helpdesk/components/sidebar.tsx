import { HdIcon } from './ui/hd-icon'
import { useBoardStore } from '@/features/helpdesk/store/board.store'

interface Props {
  currentBoardId?: string
  onBoardSelect: (id: string) => void
  onWrite: () => void
}

export function Sidebar({ currentBoardId, onBoardSelect, onWrite }: Props) {
  const boards = useBoardStore((s) => s.boards)
  return (
    <aside className="sidebar">
      <div className="sidebar__title">게시판 Boards</div>
      {boards.map((b) => (
        <button
          key={b.id}
          className="boardlink"
          aria-current={b.id === currentBoardId ? 'page' : undefined}
          onClick={() => onBoardSelect(b.id)}
        >
          <span className="boardlink__icon"><HdIcon name={b.icon} size={18}/></span>
          {b.name}
          <span className="boardlink__count">0</span>
        </button>
      ))}
      <div className="sidebar__cta">
        <button className="w-btn w-btn--solid w-btn--md w-btn--block" onClick={onWrite} style={{display:'flex',alignItems:'center',gap:6}}>
          <HdIcon name="pencil" size={16}/>글쓰기
        </button>
      </div>
    </aside>
  )
}
