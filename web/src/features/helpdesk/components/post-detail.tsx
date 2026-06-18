import { useState } from 'react'
import type { CommentListItem } from '@/api/types.gen'
import {
  usePost,
  useComments,
  useCreateComment,
  useDeleteComment,
  useSetPostReaction,
  useSetCommentReaction,
  useDeletePost,
} from '@/features/helpdesk/hooks/use-posts'
import { HdIcon, HdAvatar, HdModal, hdToast } from './ui'
import { timeAgo, dateFull, nfmt } from '@/features/helpdesk/lib/time'

interface Props {
  postId: string
  boardId: string
  boardName: string
  boardIcon: string
  onBack: () => void
  onEdit: () => void
  isAuthenticated: boolean
  currentUserEmail?: string
}

function shortId(id?: string) {
  if (!id) return '(알 수 없음)'
  return id.length > 8 ? id.slice(0, 8) + '...' : id
}

// ── CommentForm ────────────────────────────────────────────────────────────────

interface CommentFormProps {
  postId: string
  parentCommentId?: string
  isAuthenticated: boolean
  onSubmit?: () => void
}

function CommentForm({ postId, parentCommentId, isAuthenticated, onSubmit }: CommentFormProps) {
  const [text, setText] = useState('')
  const create = useCreateComment()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    create.mutate(
      { postId, content: trimmed, parentCommentId },
      {
        onSuccess: () => {
          setText('')
          hdToast('댓글이 등록되었습니다.')
          onSubmit?.()
        },
        onError: () => hdToast('댓글 등록에 실패했습니다.', 'negative'),
      }
    )
  }

  return (
    <form className="cmt-form" onSubmit={handleSubmit}>
      <textarea
        className="cmt-form__input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={isAuthenticated ? '댓글을 입력하세요.' : '로그인 후 댓글을 작성할 수 있습니다.'}
        disabled={!isAuthenticated || create.isPending}
        rows={3}
      />
      <div className="cmt-form__foot">
        <button
          type="submit"
          className="w-btn w-btn--solid w-btn--sm"
          disabled={!isAuthenticated || !text.trim() || create.isPending}
        >
          등록
        </button>
      </div>
    </form>
  )
}

// ── CommentItem ────────────────────────────────────────────────────────────────

interface CommentItemProps {
  comment: CommentListItem
  postId: string
  isAuthenticated: boolean
  currentUserEmail?: string
}

function CommentItem({ comment, postId, isAuthenticated, currentUserEmail }: CommentItemProps) {
  const [showReply, setShowReply] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [localReaction, setLocalReaction] = useState<'LIKE' | 'DISLIKE' | null>(null)
  const setReaction = useSetCommentReaction()
  const deleteComment = useDeleteComment()

  const isOwn = !!currentUserEmail && currentUserEmail === comment.authorId

  function handleReaction(type: 'LIKE' | 'DISLIKE') {
    if (!isAuthenticated || !comment.id) return
    const next = localReaction === type ? null : type
    setLocalReaction(next)
    setReaction.mutate({ commentId: comment.id, postId, type: next })
  }

  function handleDelete() {
    if (!comment.id) return
    deleteComment.mutate(
      { commentId: comment.id, postId },
      {
        onSuccess: () => {
          setDeleteOpen(false)
          hdToast('댓글이 삭제되었습니다.')
        },
        onError: () => hdToast('댓글 삭제에 실패했습니다.', 'negative'),
      }
    )
  }

  const inner = (
    <div className="cmt">
      <HdAvatar name={shortId(comment.authorId)} size="sm" />
      <div className="cmt__body">
        <div className="cmt__meta">
          <span className="cmt__author">{shortId(comment.authorId)}</span>
          <span className="cmt__time" title={comment.createdAt ? dateFull(comment.createdAt) : ''}>
            {comment.createdAt ? timeAgo(comment.createdAt) : ''}
          </span>
        </div>
        <p className="cmt__content">{comment.content}</p>
        <div className="cmt__actions">
          <button
            className={`cmt__reactbtn${localReaction === 'LIKE' ? ' cmt__reactbtn--active' : ''}`}
            onClick={() => handleReaction('LIKE')}
            disabled={!isAuthenticated}
            title="좋아요"
          >
            <HdIcon name="like" size={14} />
            <span>{nfmt((comment.likeCount ?? 0))}</span>
          </button>
          <button
            className={`cmt__reactbtn${localReaction === 'DISLIKE' ? ' cmt__reactbtn--active' : ''}`}
            onClick={() => handleReaction('DISLIKE')}
            disabled={!isAuthenticated}
            title="싫어요"
          >
            <HdIcon name="dislike" size={14} />
            <span>{nfmt((comment.dislikeCount ?? 0))}</span>
          </button>
          {isAuthenticated && !comment.parentCommentId && (
            <button
              className="cmt__replybtn"
              onClick={() => setShowReply((v) => !v)}
              title="답글"
            >
              <HdIcon name="reply" size={14} />
              <span>답글</span>
            </button>
          )}
          {isOwn && (
            <button
              className="cmt__deletebtn"
              onClick={() => setDeleteOpen(true)}
              title="삭제"
            >
              <HdIcon name="trash" size={14} />
            </button>
          )}
        </div>
        {showReply && (
          <CommentForm
            postId={postId}
            parentCommentId={comment.id}
            isAuthenticated={isAuthenticated}
            onSubmit={() => setShowReply(false)}
          />
        )}
      </div>

      <HdModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="댓글 삭제"
        footer={
          <>
            <button className="w-btn w-btn--ghost w-btn--sm" onClick={() => setDeleteOpen(false)}>
              취소
            </button>
            <button
              className="w-btn w-btn--solid w-btn--sm w-btn--danger"
              onClick={handleDelete}
              disabled={deleteComment.isPending}
            >
              삭제
            </button>
          </>
        }
      >
        댓글을 삭제하시겠습니까?
      </HdModal>
    </div>
  )

  if (comment.parentCommentId) {
    return <div className="cmt--reply">{inner}</div>
  }
  return inner
}

// ── PostDetail ─────────────────────────────────────────────────────────────────

export function PostDetail({
  postId,
  boardName,
  boardIcon,
  onBack,
  onEdit,
  isAuthenticated,
  currentUserEmail,
}: Props) {
  const { data: post, isLoading: postLoading } = usePost(postId)
  const { data: commentsPage } = useComments(postId)
  const deletePost = useDeletePost()
  const setPostReaction = useSetPostReaction()

  const [postReaction, setPostReactionLocal] = useState<'LIKE' | 'DISLIKE' | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const comments = commentsPage?.content ?? []

  function handlePostReaction(type: 'LIKE' | 'DISLIKE') {
    if (!isAuthenticated) return
    const next = postReaction === type ? null : type
    setPostReactionLocal(next)
    setPostReaction.mutate({ postId, type: next })
  }

  function handleDeletePost() {
    deletePost.mutate(postId, {
      onSuccess: () => {
        setDeleteOpen(false)
        hdToast('게시글이 삭제되었습니다.')
        onBack()
      },
      onError: () => hdToast('게시글 삭제에 실패했습니다.', 'negative'),
    })
  }

  const isOwn = !!currentUserEmail && currentUserEmail === post?.authorId

  if (postLoading) {
    return <div className="post-detail__loading">불러오는 중...</div>
  }

  if (!post) {
    return <div className="post-detail__empty">게시글을 찾을 수 없습니다.</div>
  }

  return (
    <div className="post-detail">
      <button className="backbtn" onClick={onBack}>
        <HdIcon name="arrowLeft" size={18} />
        <span>목록으로</span>
      </button>

      <div className="panel">
        <div className="post-head">
          <div className="post-head__breadcrumb">
            <HdIcon name={boardIcon} size={16} />
            <span>{boardName}</span>
          </div>
          <h1 className="post-head__title">{post.title}</h1>
          <div className="post-head__meta">
            <HdAvatar name={shortId(post.authorId)} size="xs" />
            <span className="post-head__author">{shortId(post.authorId)}</span>
            <span className="post-head__date" title={post.createdAt ? dateFull(post.createdAt) : ''}>
              {post.createdAt ? timeAgo(post.createdAt) : ''}
            </span>
            <span className="post-head__comment-count">
              <HdIcon name="comment" size={14} />
              <span>{nfmt(comments.length)}</span>
            </span>
          </div>
        </div>

        <div className="post-body">
          <p style={{ whiteSpace: 'pre-wrap' }}>{post.content}</p>
        </div>

        <div className="reactbar">
          <button
            className={`reactbtn${postReaction === 'LIKE' ? ' reactbtn--active' : ''}`}
            onClick={() => handlePostReaction('LIKE')}
            disabled={!isAuthenticated}
            title="좋아요"
          >
            <HdIcon name="like" size={18} />
            <span>좋아요</span>
          </button>
          <button
            className={`reactbtn${postReaction === 'DISLIKE' ? ' reactbtn--active' : ''}`}
            onClick={() => handlePostReaction('DISLIKE')}
            disabled={!isAuthenticated}
            title="싫어요"
          >
            <HdIcon name="dislike" size={18} />
            <span>싫어요</span>
          </button>
        </div>

        {isOwn && (
          <div className="post-actions">
            <button className="w-btn w-btn--ghost w-btn--sm" onClick={onEdit}>
              <HdIcon name="pencil" size={15} />
              수정
            </button>
            <button
              className="w-btn w-btn--ghost w-btn--sm w-btn--danger"
              onClick={() => setDeleteOpen(true)}
            >
              <HdIcon name="trash" size={15} />
              삭제
            </button>
          </div>
        )}

        <div className="comments">
          <div className="comments__header">
            댓글 <strong>{nfmt(comments.length)}</strong>
          </div>
          <div className="comments__list">
            {comments.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                postId={postId}
                isAuthenticated={isAuthenticated}
                currentUserEmail={currentUserEmail}
              />
            ))}
          </div>
          <CommentForm postId={postId} isAuthenticated={isAuthenticated} />
        </div>
      </div>

      <HdModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="게시글 삭제"
        footer={
          <>
            <button className="w-btn w-btn--ghost w-btn--sm" onClick={() => setDeleteOpen(false)}>
              취소
            </button>
            <button
              className="w-btn w-btn--solid w-btn--sm w-btn--danger"
              onClick={handleDeletePost}
              disabled={deletePost.isPending}
            >
              삭제
            </button>
          </>
        }
      >
        게시글을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
      </HdModal>
    </div>
  )
}
