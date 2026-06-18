import { useState } from 'react'
import { HdIcon, HdAvatar, HdBadge, HdModal, HdPagination, hdToast } from './ui'
import {
  useAdminUsers,
  useAdminUser,
  useDeleteAdminUser,
  useResetPassword,
  useCreateBoard,
} from '@/features/helpdesk/hooks/use-admin'
import { useBoardStore, BOARD_ICONS } from '@/features/helpdesk/store/board.store'
import { useAuthStore } from '@/features/auth/store/auth.store'
import { dateFull, nfmt } from '@/features/helpdesk/lib/time'

interface Props {
  onExit: () => void
}

// ── Role pill ────────────────────────────────────────────────────────────────

function RolePill({ role }: { role?: string }) {
  const isAdmin = role === 'ADMIN'
  return (
    <span className={`role-pill ${isAdmin ? 'role-pill--admin' : 'role-pill--user'}`}>
      {isAdmin ? '관리자' : '일반'}
    </span>
  )
}

// ── User drawer ──────────────────────────────────────────────────────────────

function UserDrawer({
  userId,
  onClose,
}: {
  userId: string | null
  onClose: () => void
}) {
  const { data: user, isLoading } = useAdminUser(userId)
  const deleteMut = useDeleteAdminUser()
  const resetMut = useResetPassword()
  const [tmpPw, setTmpPw] = useState<string | null>(null)

  if (!userId) return null

  async function handleReset() {
    if (!userId) return
    const result = await resetMut.mutateAsync(userId)
    const pw = (result as { temporaryPassword?: string })?.temporaryPassword ?? String(result ?? '')
    setTmpPw(pw)
    hdToast('비밀번호가 초기화되었습니다.', 'success')
  }

  async function handleDelete() {
    if (!userId) return
    if (!confirm('정말 삭제하시겠습니까?')) return
    await deleteMut.mutateAsync(userId)
    hdToast('회원이 삭제되었습니다.', 'success')
    onClose()
  }

  return (
    <aside className="drawer">
      <div className="drawer__head">
        <span className="drawer__title">회원 상세</span>
        <button className="w-iconbtn" onClick={onClose} aria-label="닫기">
          <HdIcon name="x" size={20} />
        </button>
      </div>
      <div className="drawer__body">
        {isLoading ? (
          <p className="drawer__loading">불러오는 중...</p>
        ) : user ? (
          <>
            <div className="drawer__avatar">
              <HdAvatar name={user.email ?? '?'} size="xl" />
            </div>
            <dl className="drawer__dl">
              <dt>이메일</dt>
              <dd>{user.email ?? '-'}</dd>
              <dt>권한</dt>
              <dd><RolePill role={user.role ?? ''} /></dd>
              <dt>USER ID</dt>
              <dd className="drawer__id">{user.id ?? '-'}</dd>
              <dt>가입일</dt>
              <dd>{user.createdAt ? dateFull(user.createdAt) : '-'}</dd>
            </dl>
            {tmpPw && (
              <div className="tmp-pw">
                <span className="tmp-pw__label">임시 비밀번호</span>
                <code className="tmp-pw__code">{tmpPw}</code>
              </div>
            )}
          </>
        ) : (
          <p className="drawer__empty">데이터를 찾을 수 없습니다.</p>
        )}
      </div>
      <div className="drawer__foot">
        <button
          className="w-btn w-btn--outline"
          onClick={handleReset}
          disabled={resetMut.isPending}
        >
          <HdIcon name="key" size={16} />
          비밀번호 초기화
        </button>
        <button
          className="w-btn w-btn--danger"
          onClick={handleDelete}
          disabled={deleteMut.isPending}
        >
          <HdIcon name="trash" size={16} />
          회원 삭제
        </button>
      </div>
    </aside>
  )
}

// ── Users page ───────────────────────────────────────────────────────────────

type Seg = 'ALL' | 'USER' | 'ADMIN'

function UsersPage() {
  const [page, setPage] = useState(1)
  const [seg, setSeg] = useState<Seg>('ALL')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, isLoading } = useAdminUsers(page, 8)
  const users = data?.content ?? []
  const totalPages = data?.totalPages ?? 1
  const total = data?.totalElements ?? 0

  const filtered = users.filter((u) => {
    if (seg !== 'ALL' && (u.role ?? '') !== seg) return false
    if (search && !(u.email ?? '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="dt-wrap">
      <UserDrawer userId={selectedId} onClose={() => setSelectedId(null)} />
      <div className="dt-toolbar">
        <div className="dt-toolbar__search">
          <HdIcon name="search" size={16} />
          <input
            className="w-input"
            placeholder="이메일 검색"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <div className="w-seg">
          {(['ALL', 'USER', 'ADMIN'] as Seg[]).map((s) => (
            <button
              key={s}
              className={`w-seg__btn${seg === s ? ' w-seg__btn--active' : ''}`}
              onClick={() => { setSeg(s); setPage(1) }}
            >
              {s === 'ALL' ? '전체' : s === 'USER' ? 'USER' : 'ADMIN'}
            </button>
          ))}
        </div>
        <span className="dt-toolbar__count">
          총 {nfmt(total)}명
          {seg !== 'ALL' && (
            <span style={{ fontSize: 11, color: 'var(--w-text-tertiary)', marginLeft: 6 }}>
              (현재 페이지 필터)
            </span>
          )}
        </span>
      </div>

      <table className="dt">
        <thead>
          <tr>
            <th>회원</th>
            <th>권한</th>
            <th>USER ID</th>
            <th>가입일</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={5} className="dt__empty">불러오는 중...</td></tr>
          ) : filtered.length === 0 ? (
            <tr><td colSpan={5} className="dt__empty">회원이 없습니다.</td></tr>
          ) : filtered.map((u) => (
            <tr
              key={u.id ?? ''}
              className="dt__row"
              onClick={() => setSelectedId(u.id ?? '')}
              style={{ cursor: 'pointer' }}
            >
              <td>
                <div className="dt__cell-user">
                  <HdAvatar name={u.email ?? '?'} size="sm" />
                  <span>{u.email ?? '-'}</span>
                </div>
              </td>
              <td><RolePill role={u.role ?? ''} /></td>
              <td><span className="dt__id">{(u.id ?? '').slice(0, 8)}…</span></td>
              <td>{u.createdAt ? dateFull(u.createdAt) : '-'}</td>
              <td>
                <button
                  className="w-iconbtn"
                  onClick={(e) => { e.stopPropagation(); setSelectedId(u.id ?? '') }}
                  aria-label="상세 보기"
                >
                  <HdIcon name="chevronRight" size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <HdPagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  )
}

// ── Board modal ──────────────────────────────────────────────────────────────

function BoardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<string>(BOARD_ICONS[0])
  const createBoard = useCreateBoard()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const slug = name.trim().toLowerCase().replace(/\s+/g, '-')
    try {
      await createBoard.mutateAsync({ name: name.trim(), icon, slug, en: slug })
      hdToast('게시판이 생성되었습니다.')
      setName('')
      setIcon(BOARD_ICONS[0])
      onClose()
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 403) {
        hdToast('게시판 생성은 관리자 권한이 필요합니다. 게시판은 로컬에 저장됩니다.', 'negative')
        // API 실패해도 로컬 스토어엔 저장됨 (useCreateBoard가 addBoard 먼저 호출)
        onClose()
      } else {
        hdToast('게시판 생성에 실패했습니다.', 'negative')
      }
    }
  }

  return (
    <HdModal
      open={open}
      onClose={onClose}
      title="새 게시판 만들기"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="w-btn w-btn--outline" type="button" onClick={onClose}>취소</button>
          <button
            className="w-btn w-btn--primary"
            form="board-form"
            type="submit"
            disabled={createBoard.isPending}
          >
            만들기
          </button>
        </div>
      }
    >
      <form id="board-form" onSubmit={handleSubmit}>
        <div className="w-field">
          <label className="w-label">게시판 이름</label>
          <input
            className="w-input"
            placeholder="게시판 이름 입력"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="w-field">
          <label className="w-label">아이콘</label>
          <div className="icon-pick">
            {BOARD_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                className={`icon-pick__btn${icon === ic ? ' icon-pick__btn--active' : ''}`}
                onClick={() => setIcon(ic)}
                aria-label={ic}
              >
                <HdIcon name={ic} size={20} />
              </button>
            ))}
          </div>
        </div>
      </form>
    </HdModal>
  )
}

// ── Boards page ──────────────────────────────────────────────────────────────

function BoardsPage() {
  const boards = useBoardStore((s) => s.boards)
  const removeBoard = useBoardStore((s) => s.removeBoard)
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="dt-wrap">
      <BoardModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <div className="dt-toolbar">
        <span className="dt-toolbar__count">총 {nfmt(boards.length)}개</span>
        <button className="w-btn w-btn--primary" onClick={() => setModalOpen(true)}>
          <HdIcon name="plus" size={16} />
          새 게시판
        </button>
      </div>

      <table className="dt">
        <thead>
          <tr>
            <th>아이콘</th>
            <th>이름</th>
            <th>슬러그</th>
            <th>생성일</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {boards.length === 0 ? (
            <tr><td colSpan={5} className="dt__empty">게시판이 없습니다.</td></tr>
          ) : boards.map((b) => (
            <tr key={b.id} className="dt__row">
              <td><HdIcon name={b.icon} size={20} /></td>
              <td>{b.name}</td>
              <td><span className="dt__id">{b.slug}</span></td>
              <td>{b.createdAt ? dateFull(b.createdAt) : '-'}</td>
              <td>
                <button
                  className="w-iconbtn w-iconbtn--danger"
                  onClick={() => {
                    if (confirm(`"${b.name}" 게시판을 삭제하시겠습니까?`)) {
                      removeBoard(b.id)
                      hdToast('게시판이 삭제되었습니다.', 'success')
                    }
                  }}
                  aria-label="삭제"
                >
                  <HdIcon name="trash" size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main admin app ───────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'users' | 'boards'

export function AdminApp({ onExit }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const user = useAuthStore((s) => s.user)
  const clearUser = useAuthStore((s) => s.clearUser)

  const { data: usersData } = useAdminUsers(1, 1)
  const totalUsers = usersData?.totalElements ?? 0

  const tabLabel: Record<Tab, string> = {
    dashboard: '대시보드',
    users: '회원 관리',
    boards: '게시판 관리',
  }

  const navItems: { id: Tab; icon: string; label: string }[] = [
    { id: 'dashboard', icon: 'dashboard', label: '대시보드' },
    { id: 'users', icon: 'users', label: '회원 관리' },
    { id: 'boards', icon: 'list', label: '게시판 관리' },
  ]

  return (
    <div className="admin">
      {/* sidebar */}
      <aside className="admin__side">
        <div className="admin__brand">
          <span className="admin__brand-name">Bootstrap</span>
          <HdBadge tone="primary">ADMIN</HdBadge>
        </div>

        <nav className="admin__nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`admin__nav-item${tab === item.id ? ' admin__nav-item--active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <HdIcon name={item.icon} size={18} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="admin__divider" />

        <button className="admin__nav-item" onClick={onExit}>
          <HdIcon name="arrowLeft" size={18} />
          게시판 바로가기
        </button>

        <div className="admin__side-foot">
          <div className="admin__side-user">
            <HdAvatar name={user?.email ?? '?'} size="sm" />
            <span className="admin__side-email">{user?.email ?? '-'}</span>
          </div>
          <button
            className="w-iconbtn"
            onClick={clearUser}
            aria-label="콘솔 나가기"
            title="콘솔 나가기"
          >
            <HdIcon name="logout" size={18} />
          </button>
        </div>
      </aside>

      {/* main */}
      <main className="admin__main">
        <div className="admin__topbar">
          <div>
            <h1 className="admin__title">{tabLabel[tab]}</h1>
            <p className="admin__subtitle">
              {tab === 'dashboard' && '서비스 현황을 한눈에 확인하세요.'}
              {tab === 'users' && '가입 회원을 조회하고 관리합니다.'}
              {tab === 'boards' && '게시판을 추가하거나 삭제합니다.'}
            </p>
          </div>
        </div>

        {/* stats always visible */}
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-card__label">전체 회원</span>
            <span className="stat-card__value">{nfmt(totalUsers)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">관리자</span>
            <span className="stat-card__value">{nfmt(0)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">전체 게시글</span>
            <span className="stat-card__value">{nfmt(0)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">답변 대기</span>
            <span className="stat-card__value">{nfmt(0)}</span>
          </div>
        </div>

        {tab === 'users' && <UsersPage />}
        {tab === 'boards' && <BoardsPage />}
      </main>
    </div>
  )
}
