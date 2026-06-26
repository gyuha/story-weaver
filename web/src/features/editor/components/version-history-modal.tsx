import type { Scene, SceneVersion } from '@/features/shared/types';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { useState } from 'react';
import { diffWords } from '../lib/word-diff';

interface Props {
  scene: Scene;
  /** 현재 씬 본문(비교 기준) — 보통 scene.paragraphs에서 합친 텍스트 */
  currentText: string;
  onRestore: (version: SceneVersion) => void;
  onClose: () => void;
}

/** 버전 기록 모달 — 시간대별 보기 · 현재로 보내기 · 인라인 단어 diff */
export function VersionHistoryModal({ scene, currentText, onRestore, onClose }: Props) {
  const versions = scene.versions ?? [];
  const [selId, setSelId] = useState<string | null>(versions[0]?.id ?? null);
  const [showDiff, setShowDiff] = useState(false);
  const selected = versions.find((v) => v.id === selId) ?? null;
  const selectedText = selected?.paragraphs.map((p) => p.text).join('\n') ?? '';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-6">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative flex h-[80vh] w-[760px] max-w-full flex-col overflow-hidden rounded-xl border border-line bg-paper shadow-xl">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
          <span className="flex-1 text-sm font-semibold text-ink">버전 기록 · {scene.title}</span>
          <button
            type="button"
            onClick={() => setShowDiff((d) => !d)}
            disabled={!selected}
            className={cn(
              'h-8 rounded-md px-2.5 text-[12.5px] font-medium transition-colors disabled:opacity-30',
              showDiff ? 'bg-primary/10 text-primary' : 'text-ink-soft hover:bg-surface'
            )}
          >
            diff 보기
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid size-8 place-items-center rounded-md text-faint hover:bg-surface hover:text-ink-soft"
          >
            <X className="size-[18px]" strokeWidth={2} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 좌: 버전 목록 (최신순) */}
          <div className="w-52 shrink-0 overflow-y-auto border-r border-line bg-surface-soft p-2">
            <div className="px-2 py-1.5 text-[11.5px] font-semibold text-faint">현재</div>
            <div className="mb-2 rounded-md bg-primary/10 px-2.5 py-2 text-[12.5px] font-medium text-primary">
              편집 중 (현재 버전)
            </div>
            <div className="px-2 py-1.5 text-[11.5px] font-semibold text-faint">이전 버전</div>
            {versions.length === 0 ? (
              <div className="px-2.5 py-2 text-[12px] text-faint">기록 없음</div>
            ) : (
              versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelId(v.id)}
                  className={cn(
                    'mb-1 block w-full rounded-md px-2.5 py-2 text-left text-[12.5px] transition-colors',
                    selId === v.id
                      ? 'bg-surface font-medium text-ink'
                      : 'text-ink-soft hover:bg-surface/60'
                  )}
                >
                  {v.savedAt}
                </button>
              ))
            )}
          </div>

          {/* 우: 선택 버전 본문 / diff */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-6 py-5 font-serif text-[15px] leading-[1.9] text-ink">
              {!selected ? (
                <div className="text-[13px] text-faint">왼쪽에서 이전 버전을 선택하세요.</div>
              ) : showDiff ? (
                <DiffView oldText={selectedText} newText={currentText} />
              ) : (
                selected.paragraphs.map((p, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 읽기 전용 스냅샷 문단
                  <p key={i} className="mb-3">
                    {p.text}
                  </p>
                ))
              )}
            </div>
            {selected && (
              <div className="flex h-14 shrink-0 items-center justify-between border-t border-line px-6">
                <span className="text-[12px] text-faint">
                  {showDiff ? '선택 버전 → 현재 변경분' : `${selected.savedAt} 버전 (읽기 전용)`}
                </span>
                <button
                  type="button"
                  onClick={() => onRestore(selected)}
                  className="h-9 rounded-md bg-primary px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  현재로 보내기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const ops = diffWords(oldText, newText);
  return (
    <p className="leading-[2]">
      {ops.map((op, i) => {
        if (op.type === 'equal')
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: diff 토큰열
            <span key={i}>{op.text} </span>
          );
        if (op.type === 'added')
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: diff 토큰열
            <span key={i} className="rounded bg-success/15 text-success underline">
              {op.text}{' '}
            </span>
          );
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: diff 토큰열
          <span key={i} className="rounded bg-[#fdebec] text-[#c4554d] line-through">
            {op.text}{' '}
          </span>
        );
      })}
    </p>
  );
}
