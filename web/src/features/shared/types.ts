// StoryWeaver 도메인 공통 타입 (docs/data-model.md 기반, MVP 범위)

export type Genre = '무협' | '로맨스 판타지' | '정통 판타지' | '현대 판타지' | 'SF' | '미스터리';

export type WritingStyle = '간결체' | '만연체' | '서정체';

export type SceneStatus = 'done' | 'draft' | 'empty';
export type EntityType = '인물' | '장소' | '사건' | '아이템';
export type MemoryReason = 'link' | 'vector';
export type StateSource = 'ai' | 'author';

/** 원고 문단: 대사(「」)는 렌더 시 구분된다. dim=회귀 이전 등 흐릿하게 표시할 보조 문단 */
export interface Paragraph {
  text: string;
  dim?: boolean;
}

export interface Scene {
  id: string;
  title: string;
  status: SceneStatus;
  /** 원고 본문 문단 */
  paragraphs: Paragraph[];
  /** 명시적으로 연결된 엔티티 — 메모리 1차 근거 */
  linkedEntityIds: string[];
  /** 벡터 유사도 보조로 끌어온 관련 엔티티 */
  vectorMemory: { entityId: string; score: number }[];
  /** 집필 중 감지된 동적 업데이트 제안 */
  updateSuggestion?: { entityId: string; body: string };
  /** 인라인 AI 이어쓰기 고스트 텍스트 */
  aiSuggestion?: string;
}

export interface Chapter {
  id: string;
  partLabel: string; // '제2부 혈산문편'
  index: number; // 화 번호
  title: string;
  scenes: Scene[];
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
  chapterRef: string; // '6화 씬1'
  chapterIndex: number;
  key: string; // power_level
  value: string; // 천뢰검 1식
  source: StateSource;
  /** 현재 시점 · AI 제안 검토 대기 */
  pending?: boolean;
}

export interface Conflict {
  id: string;
  entityName: string;
  deadChapter: number;
  appearChapter: number;
  deadKey: string;
  deadValue: string;
  note: string;
  axis: { from: number; to: number; total: number };
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
  genre: Genre;
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
