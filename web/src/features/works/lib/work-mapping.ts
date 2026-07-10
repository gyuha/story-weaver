import type { WorkResponse } from '@/api';
import type { Work } from '@/features/shared/types';

// eco: 챕터·엔티티·타임라인·충돌은 백엔드 하위 도메인 미구현 — 빈 배열로 시작(세션 내 로컬 편집)
export function toWork(response: WorkResponse): Work {
  return { ...response, chapters: [], entities: [], timeline: [], conflicts: [] } as Work;
}
