import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getBoardsByBoardIdPosts, getPostsByPostId, getPostsByPostIdComments,
  postBoardsByBoardIdPosts, putPostsByPostId, deletePostsByPostId,
  postPostsByPostIdComments, deleteCommentsByCommentId,
  putPostsByPostIdReactions, deletePostsByPostIdReactions,
  putCommentsByCommentIdReactions, deleteCommentsByCommentIdReactions,
} from '@/api/sdk.gen'

const EMPTY_PAGE = { content: [], totalElements: 0, totalPages: 1, pageNumber: 1, pageSize: 10 }

export function usePostList(boardId: string, page: number, size = 10) {
  return useQuery({
    queryKey: ['posts', boardId, page, size],
    queryFn: () =>
      getBoardsByBoardIdPosts({ path: { boardId }, query: { page: page - 1, size } })
        .then((r) => r.data?.data ?? EMPTY_PAGE),
    enabled: !!boardId,
    retry: false,
  })
}

export function usePost(postId: string) {
  return useQuery({
    queryKey: ['post', postId],
    queryFn: () => getPostsByPostId({ path: { postId } }).then((r) => r.data?.data),
    enabled: !!postId,
  })
}

export function useComments(postId: string) {
  return useQuery({
    queryKey: ['comments', postId],
    queryFn: () =>
      getPostsByPostIdComments({ path: { postId }, query: { page: 0, size: 100 } })
        .then((r) => r.data?.data),
    enabled: !!postId,
  })
}

export function useCreatePost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { boardId: string; title: string; content: string }) =>
      postBoardsByBoardIdPosts({
        path: { boardId: vars.boardId },
        body: { title: vars.title, content: vars.content },
      }).then((r) => r.data?.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  })
}

export function useUpdatePost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { postId: string; title: string; content: string }) =>
      putPostsByPostId({
        path: { postId: vars.postId },
        body: { title: vars.title, content: vars.content },
      }).then((r) => r.data?.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['post', vars.postId] })
      qc.invalidateQueries({ queryKey: ['posts'] })
    },
  })
}

export function useDeletePost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (postId: string) => deletePostsByPostId({ path: { postId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  })
}

export function useCreateComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { postId: string; content: string; parentCommentId?: string }) =>
      postPostsByPostIdComments({
        path: { postId: vars.postId },
        body: { content: vars.content, parentCommentId: vars.parentCommentId },
      }).then((r) => r.data?.data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['comments', vars.postId] }),
  })
}

export function useDeleteComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { commentId: string; postId: string }) =>
      deleteCommentsByCommentId({ path: { commentId: vars.commentId } }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['comments', vars.postId] }),
  })
}

export function useSetPostReaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { postId: string; type: 'LIKE' | 'DISLIKE' | null }) =>
      vars.type === null
        ? deletePostsByPostIdReactions({ path: { postId: vars.postId } })
        : putPostsByPostIdReactions({ path: { postId: vars.postId }, body: { type: vars.type } }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['post', vars.postId] }),
  })
}

export function useSetCommentReaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { commentId: string; postId: string; type: 'LIKE' | 'DISLIKE' | null }) =>
      vars.type === null
        ? deleteCommentsByCommentIdReactions({ path: { commentId: vars.commentId } })
        : putCommentsByCommentIdReactions({
            path: { commentId: vars.commentId },
            body: { type: vars.type },
          }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['comments', vars.postId] }),
  })
}
