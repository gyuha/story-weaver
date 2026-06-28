import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { seedMembers } from '../mock/members';
import type { Member } from '../types';

interface AdminState {
  members: Member[];
  /** 승인 대기 회원을 승인 */
  approveMember: (id: string) => void;
  /** 승인 대기 회원을 거부 */
  rejectMember: (id: string) => void;
}

export const useAdminStore = create<AdminState>()(
  immer((set) => ({
    members: seedMembers,
    approveMember: (id) =>
      set((state) => {
        const m = state.members.find((x) => x.id === id);
        if (m) m.status = 'approved';
      }),
    rejectMember: (id) =>
      set((state) => {
        const m = state.members.find((x) => x.id === id);
        if (m) m.status = 'rejected';
      }),
  }))
);
