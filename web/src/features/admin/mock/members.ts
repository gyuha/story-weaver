import type { Member } from '../types';

/** 목업 회원 시드 — 다양한 승인 상태 혼합 */
export const seedMembers: Member[] = [
  {
    id: 'm-baekya',
    email: 'baekya@storyweaver.kr',
    displayName: '백야',
    signupDate: '2026-05-02',
    status: 'approved',
    workCount: 3,
  },
  {
    id: 'm-cheonryu',
    email: 'cheonryu@storyweaver.kr',
    displayName: '천류운',
    signupDate: '2026-06-18',
    status: 'approved',
    workCount: 1,
  },
  {
    id: 'm-noah',
    email: 'noah.kim@gmail.com',
    displayName: '김노아',
    signupDate: '2026-06-24',
    status: 'pending',
    workCount: 0,
  },
  {
    id: 'm-seorin',
    email: 'seorin@naver.com',
    displayName: '서린',
    signupDate: '2026-06-25',
    status: 'pending',
    workCount: 0,
  },
  {
    id: 'm-jihu',
    email: 'jihu@kakao.com',
    displayName: '지후',
    signupDate: '2026-06-26',
    status: 'pending',
    workCount: 0,
  },
  {
    id: 'm-spam',
    email: 'spam-bot@tempmail.io',
    displayName: 'unknown',
    signupDate: '2026-06-20',
    status: 'rejected',
    workCount: 0,
  },
];
