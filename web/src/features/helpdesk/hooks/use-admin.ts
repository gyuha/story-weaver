import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAdminUsers, getAdminUsersById, deleteAdminUsersById,
  postAdminUsersByIdPasswordReset, postBoards,
} from '@/api/sdk.gen'
import { useBoardStore } from '@/features/helpdesk/store/board.store'
import type { BoardInfo } from '@/features/helpdesk/store/board.store'

export function useAdminUsers(page: number, size: number) {
  return useQuery({
    queryKey: ['admin-users', page, size],
    queryFn: () =>
      getAdminUsers({ query: { page: page - 1, size } })
        .then((r) => r.data?.data ?? { content: [], totalElements: 0, totalPages: 1, pageNumber: 1, pageSize: size }),
  })
}

export function useAdminUser(id: string | null) {
  return useQuery({
    queryKey: ['admin-user', id],
    queryFn: () => getAdminUsersById({ path: { id: id! } }).then((r) => r.data?.data ?? null),
    enabled: !!id,
  })
}

export function useDeleteAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAdminUsersById({ path: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (id: string) =>
      postAdminUsersByIdPasswordReset({ path: { id } }).then((r) => r.data?.data),
  })
}

export function useCreateBoard() {
  const addBoard = useBoardStore((s) => s.addBoard)
  return useMutation({
    mutationFn: async (vars: Omit<BoardInfo, 'id' | 'createdAt'> & { createdAt?: string }) => {
      // API 호출 시도 (ADMIN이면 서버에도 생성, USER면 403 but 로컬엔 저장)
      let id: string = crypto.randomUUID()
      let createdAt = vars.createdAt ?? new Date(0).toISOString()
      try {
        const res = await postBoards({ body: { name: vars.name } })
        if (res.data?.data?.id) id = res.data.data.id
        if (res.data?.data?.createdAt) createdAt = res.data.data.createdAt
      } catch { /* 403 등 에러 무시 - 로컬에만 저장 */ }
      const board: BoardInfo = { ...vars, id, createdAt }
      addBoard(board)
      return board
    },
  })
}
