import { useEffect, useState } from 'react'
import { usePost, useCreatePost, useUpdatePost } from '@/features/helpdesk/hooks/use-posts'
import { useBoardStore } from '@/features/helpdesk/store/board.store'
import { HdIcon, hdToast } from './ui'

interface Props {
  mode: 'write' | 'edit'
  boardId?: string
  postId?: string
  onBack: () => void
  onSuccess: (postId: string) => void
}

export function PostEditor({ mode, boardId, postId, onBack, onSuccess }: Props) {
  const boards = useBoardStore((s) => s.boards)
  const { data: post } = usePost(postId ?? '')

  const [selectedBoardId, setSelectedBoardId] = useState(boardId ?? '')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState('')

  const createPost = useCreatePost()
  const updatePost = useUpdatePost()

  useEffect(() => {
    if (mode === 'edit' && post) {
      setTitle(post.title ?? '')
      setContent(post.content ?? '')
    }
  }, [mode, post])

  async function handleSubmit() {
    if (!title.trim()) { setError('제목을 입력해 주세요.'); return }
    if (!content.trim()) { setError('내용을 입력해 주세요.'); return }
    setError('')

    try {
      if (mode === 'write') {
        const data = await createPost.mutateAsync({ boardId: selectedBoardId, title, content })
        const newId = data?.id
        if (!newId) { setError('게시글 등록에 실패했습니다. 게시판이 서버에 존재하지 않을 수 있습니다.'); return }
        hdToast('글이 등록되었습니다.')
        onSuccess(newId)
      } else {
        const data = await updatePost.mutateAsync({ postId: postId!, title, content })
        hdToast('글이 수정되었습니다.')
        onSuccess(data?.id ?? postId!)
      }
    } catch {
      setError('서버 오류가 발생했습니다. 백엔드 연결을 확인해 주세요.')
    }
  }

  const isPending = createPost.isPending || updatePost.isPending
  const charCount = content.length

  return (
    <section className="main">
      <button className="backbtn" onClick={onBack}>
        <HdIcon name="arrowLeft" size={16} />
        취소하고 돌아가기
      </button>

      <div className="panel" style={{ marginTop: 12 }}>
        {/* 헤더 */}
        <div className="panel__head">
          <div className="panel__head-icon">
            <HdIcon name="pencil" size={20} />
          </div>
          <div>
            <h2 className="w-title-2" style={{ margin: 0 }}>
              {mode === 'write' ? '새 글 작성' : '글 수정'}
            </h2>
            <div className="panel__head-sub">
              명확한 제목과 충분한 정보를 적어주시면 더 빠르게 도와드릴 수 있어요.
            </div>
          </div>
        </div>

        {/* 에디터 */}
        <div className="editor-form">
          {/* 게시판 선택 */}
          <div className="editor-form__board-row">
            <span className="editor-form__board-label">게시판</span>
            <select
              className="editor-form__board-select"
              value={selectedBoardId}
              onChange={(e) => setSelectedBoardId(e.target.value)}
              disabled={mode === 'edit'}
            >
              <option value="">게시판 선택</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* 제목 */}
          <input
            className="editor-form__title"
            type="text"
            placeholder="제목을 입력하세요"
            maxLength={200}
            value={title}
            onChange={(e) => { setTitle(e.target.value); setError('') }}
          />

          {/* 내용 */}
          <textarea
            className="editor-form__body"
            placeholder={`내용을 입력하세요.\n\n문의 시 주문번호, 기기/브라우저 환경, 발생 시각 등을 함께 적어주시면 빠른 처리에 도움이 됩니다.`}
            value={content}
            onChange={(e) => { setContent(e.target.value); setError('') }}
          />

          {error && (
            <div className="w-field__error" style={{ padding: '0 28px' }}>{error}</div>
          )}

          {/* 하단 푸터 */}
          <div className="editor-form__foot">
            <span className="editor-form__charcount">{charCount}자</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="w-btn w-btn--ghost w-btn--md" onClick={onBack} disabled={isPending}>
                취소
              </button>
              <button
                className="w-btn w-btn--solid w-btn--md"
                onClick={handleSubmit}
                disabled={isPending}
                style={{ gap: 6 }}
              >
                <HdIcon name="check" size={16} />
                {isPending ? '저장 중…' : mode === 'write' ? '등록하기' : '수정 완료'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
