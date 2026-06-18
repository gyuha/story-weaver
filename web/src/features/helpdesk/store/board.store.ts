import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface BoardInfo {
  id: string
  name: string
  slug: string
  icon: string
  en: string
  createdAt: string
}

interface BoardState {
  boards: BoardInfo[]
  addBoard: (b: BoardInfo) => void
  removeBoard: (id: string) => void
  updateBoard: (id: string, data: Partial<BoardInfo>) => void
  setBoards: (boards: BoardInfo[]) => void
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set) => ({
      boards: [],
      addBoard: (b) => set((s) => ({ boards: [...s.boards, b] })),
      removeBoard: (id) => set((s) => ({ boards: s.boards.filter((b) => b.id !== id) })),
      updateBoard: (id, data) =>
        set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, ...data } : b)) })),
      setBoards: (boards) => set({ boards }),
    }),
    { name: 'helpdesk-boards' }
  )
)

export const BOARD_ICONS = [
  'list', 'megaphone', 'help', 'chat', 'card', 'bug', 'bulb', 'coffee',
  'comment', 'users', 'shield', 'clock', 'home', 'key', 'pencil', 'dashboard',
] as const
