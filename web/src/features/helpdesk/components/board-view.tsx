import { useState } from 'react'
import type { PostListItem } from '@/api/types.gen'
import { usePostList } from '@/features/helpdesk/hooks/use-posts'
import { HdIcon, HdPagination } from './ui'
import { timeAgo, nfmt } from '@/features/helpdesk/lib/time'

export interface BoardViewProps {
  boardId: string
  boardName: string
  boardEn: string
  boardIcon: string
  page: number
  q: string
  onPageChange: (p: number) => void
  onSearch?: (q: string) => void
  onPostClick: (postId: string) => void
  onWrite: () => void
  isAuthenticated: boolean
}

export function BoardView({
  boardId, boardName, boardEn, boardIcon,
  page, onPageChange, onSearch, onPostClick, onWrite, isAuthenticated,
}: BoardViewProps) {
  const [pageSize, setPageSize] = useState(10)
  const [localQ, setLocalQ] = useState('')
  const { data, isLoading, error } = usePostList(boardId, page, pageSize)

  const content: PostListItem[] = data?.content ?? []
  const total = data?.totalElements ?? 0
  const totalPages = data?.totalPages ?? 1
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  // 에러 상태
  const errStatus = (error as { response?: { status?: number } })?.response?.status
  const isUnauth = errStatus === 401
  // 404: 서버에 없는 게시판 (로컬 생성) → 빈 상태로 표시

  return (
    <section className="main">
      <div className="panel">
        <div className="panel__head">
          <div className="panel__head-icon"><HdIcon name={boardIcon} size={22} /></div>
          <div>
            <h1 className="w-title-1" style={{ margin: 0 }}>{boardName}</h1>
            <div className="panel__head-sub">{boardEn} · 전체 {nfmt(total)}개의 글</div>
          </div>
        </div>

        <div className="toolbar">
          <div className="toolbar__count">총 <b>{nfmt(total)}</b>건</div>
          <div className="toolbar__spacer" />
          <form
            className="miniinput"
            onSubmit={(e) => { e.preventDefault(); onSearch?.(localQ); onPageChange(1) }}
          >
            <HdIcon name="search" size={16} />
            <input
              placeholder={`${boardName} 검색`}
              value={localQ}
              onChange={(e) => setLocalQ(e.target.value)}
            />
          </form>
          {isAuthenticated && (
            <button className="w-btn w-btn--tinted w-btn--md" onClick={onWrite} type="button" style={{ gap: 6 }}>
              <HdIcon name="pencil" size={16} />글쓰기
            </button>
          )}
        </div>

        <div className="ptable">
          <div className="ptable__row ptable__row--head">
            <div>번호</div>
            <div>제목</div>
            <div className="col-author" style={{ textAlign: 'left' }}>작성자</div>
            <div style={{ textAlign: 'center' }}>날짜</div>
            <div className="col-view" style={{ textAlign: 'center' }}>조회</div>
            <div style={{ textAlign: 'center' }}>추천</div>
          </div>

          {isUnauth ? (
            <div className="empty" style={{ padding: 48 }}>
              <div className="empty__icon"><HdIcon name="lock" size={28} /></div>
              <div style={{ fontWeight: 700, color: 'var(--w-text-secondary)', marginBottom: 4 }}>로그인이 필요합니다</div>
              <div style={{ fontSize: 14 }}>게시판을 보려면 먼저 로그인해 주세요.</div>
            </div>
          ) : isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="ptable__row" style={{ opacity: 0.3 }}>
                <div style={{ background: 'var(--w-bg-muted)', borderRadius: 4, height: 16, width: '100%' }} />
                <div /><div /><div /><div /><div />
              </div>
            ))
          ) : content.length === 0 ? (
            <div className="empty">
              <div className="empty__icon"><HdIcon name={boardIcon} size={28} /></div>
              <div style={{ fontWeight: 700, color: 'var(--w-text-secondary)', marginBottom: 4 }}>
                아직 등록된 글이 없습니다
              </div>
              <div style={{ fontSize: 14 }}>첫 번째 글을 작성해 보세요.</div>
            </div>
          ) : (
            content.map((post, idx) => {
              const no = total - (page - 1) * pageSize - idx
              return (
                <div
                  key={post.id}
                  className="ptable__row"
                  onClick={() => onPostClick(post.id ?? '')}
                >
                  <div className="ptable__no">{no}</div>
                  <div className="ptable__title">
                    <span className="ptable__title-text">{post.title}</span>
                  </div>
                  <div className="ptable__author col-author">
                    <span>{(post.authorId ?? '').slice(0, 8)}</span>
                  </div>
                  <div className="ptable__meta">{timeAgo(post.createdAt ?? '')}</div>
                  <div className="ptable__meta col-view">-</div>
                  <div className="ptable__like">
                    {(post.likeCount ?? 0) > 0 ? <b>{post.likeCount}</b> : '–'}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="list-foot">
          <div className="listfoot__range">
            {total === 0 ? '0건' : `${nfmt(from)}–${nfmt(to)} / ${nfmt(total)}건`}
          </div>
          <div className="listfoot__pages">
            <HdPagination page={page} totalPages={totalPages} onPage={onPageChange} />
          </div>
          <div className="listfoot__size">
            <span>페이지당</span>
            <select
              className="listfoot__select"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); onPageChange(1) }}
            >
              {[10, 20, 50].map((n) => <option key={n} value={n}>{n}개</option>)}
            </select>
          </div>
        </div>
      </div>
    </section>
  )
}
