// StoryWeaver 도메인 공통 타입 (docs/data-model.md 기반, MVP 범위)
import type { AttributeChange, CandidateEntity, TimelineChange } from '@/api';

export type WritingStyle = '간결체' | '만연체' | '서정체';

export type ChapterStatus = 'done' | 'draft' | 'empty';
export type EntityType = '인물' | '장소' | '사건' | '아이템';
export type MemoryReason = 'link' | 'vector';
export type StateSource = 'ai' | 'author';

/** 원고 문단: 대사(「」)는 렌더 시 구분된다. dim=회귀 이전 등 흐릿하게 표시할 보조 문단 */
export interface Paragraph {
  text: string;
  dim?: boolean;
}

/** 화 저장 후 추출된, 승인 대기 중인 동적 업데이트 제안 (kind별 payload 모양은 백엔드 스키마와 동일) */
export type UpdateSuggestion =
  | { id: string; kind: 'new_entity'; payload: CandidateEntity }
  | { id: string; kind: 'attribute_change'; payload: AttributeChange }
  | { id: string; kind: 'timeline_state'; payload: TimelineChange };

/** 버전 기록의 한 스냅샷 — 작가 집필 시간축의 과거 본문 (타임라인 상태와 다른 축) */
export interface ChapterVersion {
  id: string;
  savedAt: string; // '2026-06-22 14:30' 등 표시용
  paragraphs: Paragraph[];
}

/** 화(Chapter) — 씬 계층 폐지 후 원고 본문·메모리·제안을 화가 직접 보유한다(remove-scene ADR). */
export interface Chapter {
  id: string;
  /** 이 화가 속한 부(Episode)의 서버 id — 실 API 경로 파라미터로 필요 */
  episodeId: string;
  partLabel: string; // '제2부 혈산문편'
  index: number; // 화 번호
  title: string;
  status: ChapterStatus;
  /**
   * 화별 줄거리 요약 — "이 화에서 무슨 일이 일어났는가" 서술. `검토 · 타임라인`
   * 화면이 화 순서대로 모아 보여준다. 아직 요약하지 않은 화는 `undefined`.
   */
  summary?: string;
  /** 원고 본문 문단 */
  paragraphs: Paragraph[];
  /** 명시적으로 연결된 엔티티 — 메모리 1차 근거 */
  linkedEntityIds: string[];
  /** 벡터 유사도 보조로 끌어온 관련 엔티티 */
  vectorMemory: { entityId: string; score: number }[];
  /** 집필 중 감지된 동적 업데이트 제안 — 승인/거절 대기 목록 */
  pendingSuggestions?: UpdateSuggestion[];
  /** 인라인 AI 이어쓰기 고스트 텍스트 */
  aiSuggestion?: string;
  /** 버전 기록 — 최신순 스냅샷 (현재 본문은 paragraphs, 과거는 여기) */
  versions?: ChapterVersion[];
}

export interface EntityRelation {
  name: string;
  role: string;
  tone?: 'enemy';
}

export interface EntityField {
  label: string; // 외모 / 성격 / 말투
  value: string;
}

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  hanja?: string;
  emoji: string;
  /** 생성·첨부된 설정 이미지 (data-uri/URL). 없으면 emoji로 표시 */
  imageUrl?: string;
  alias?: string;
  summary: string;
  fields: EntityField[];
  sampleLines?: string[];
  relations?: EntityRelation[];
}

export interface TimelineState {
  id: string;
  entityId: string;
  entityName: string;
  chapterRef: string; // '6화'
  chapterIndex: number;
  key: string; // power_level
  value: string; // 천뢰검 1식
  source: StateSource;
  /** 현재 시점 · AI 제안 검토 대기 */
  pending?: boolean;
}

export interface ConflictChapterRef {
  chapterId: string;
  chapterRef: string; // '6화' — 매칭되는 화가 없으면 ''
  globalSeq: number;
  stateValue: string;
}

export interface Conflict {
  id: string;
  entityId: string;
  entityName: string;
  stateKey: string;
  earlier: ConflictChapterRef;
  later: ConflictChapterRef;
}

export interface WorkStats {
  chapters: number;
  words: string; // '12.4'만자 → '12.4'
  wordsUnit: string; // '만자'
  characters: number;
  progress: number; // 0~100
}

export interface Work {
  id: string;
  title: string;
  /** 표지/사이드바용 한 글자 약자 */
  shortLabel: string;
  genre: string;
  subGenre: string; // '회귀' 등 라벨
  keywords: string[];
  style: WritingStyle;
  status: '연재 중' | '구상' | '초고';
  coverTheme: 'dark' | 'green' | 'orange';
  stats: WorkStats;
  lastEditedLabel: string;
  chapters: Chapter[];
  entities: Entity[];
  timeline: TimelineState[];
  conflicts: Conflict[];
  reviewSummary: { scenes: number; states: number; conflicts: number };
}

export interface Usage {
  plan: string; // '무료 플랜'
  usedTokens: number; // 320000
  totalTokens: number; // 500000
}
