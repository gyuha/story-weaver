import { findSceneLocation, groupChaptersByPart } from '@/features/shared/store/selectors';
import { useWorksStore } from '@/features/shared/store/works.store';
import type { Chapter, Work } from '@/features/shared/types';
import { cn } from '@/lib/utils';
import useModal from '@/stores/modal-store';
import { Link } from '@tanstack/react-router';
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FolderPlus,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { useRef, useState } from 'react';

interface WorkTreeProps {
  work: Work;
  activeSceneId?: string;
}

export function WorkTree({ work, activeSceneId }: WorkTreeProps) {
  const parts = groupChaptersByPart(work);
  const activeLoc = findSceneLocation(work, activeSceneId);
  const activeChapterId = activeLoc?.chapter.id;
  const addChapter = useWorksStore((s) => s.addChapter);
  const addPart = useWorksStore((s) => s.addPart);
  const renamePart = useWorksStore((s) => s.renamePart);
  const renameChapter = useWorksStore((s) => s.renameChapter);
  const deleteChapter = useWorksStore((s) => s.deleteChapter);
  const deletePart = useWorksStore((s) => s.deletePart);
  const openModal = useModal((s) => s.openModal);
  const closeModal = useModal((s) => s.closeModal);
  // 열린 ⋯ 메뉴 식별 키 (`part:<라벨>` / `ch:<id>`)
  const [menuFor, setMenuFor] = useState<string | null>(null);

  // 활성 씬을 포함한 부는 펼친 상태로 시작. 활성 씬이 없으면 마지막 부를 펼친다.
  const [openParts, setOpenParts] = useState<Set<string>>(() => {
    const set = new Set<string>();
    if (activeLoc) set.add(activeLoc.chapter.partLabel);
    else if (parts.length) set.add(parts[parts.length - 1].part);
    return set;
  });
  // 인라인 편집 중인 대상 (부는 라벨, 화는 id로 식별)
  const [editingPart, setEditingPart] = useState<string | null>(null);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);

  const togglePart = (part: string) => {
    setOpenParts((s) => {
      const next = new Set(s);
      next.has(part) ? next.delete(part) : next.add(part);
      return next;
    });
  };

  const handleAddChapter = (part: string) => {
    const id = addChapter(work.id, part);
    setOpenParts((s) => new Set(s).add(part));
    setEditingChapterId(id);
  };

  const handleAddPart = () => {
    const label = addPart(work.id);
    setOpenParts((s) => new Set(s).add(label));
    setEditingPart(label);
  };

  // 실수 추가 방지용 확인 다이얼로그 (삭제 수단이 없어 추가 전 한 번 확인)
  const confirmAddChapter = (part: string) =>
    openModal({
      size: 'sm',
      title: '새 화 추가',
      alert: `'${part}'에 새 화를 추가할까요?`,
      txtCancel: '취소',
      handleOk: () => {
        closeModal();
        handleAddChapter(part);
      },
    });

  const confirmAddPart = () =>
    openModal({
      size: 'sm',
      title: '새 부 추가',
      alert: '새 부를 추가할까요?',
      txtCancel: '취소',
      handleOk: () => {
        closeModal();
        handleAddPart();
      },
    });

  // 삭제는 복구 불가 — 확인 다이얼로그를 거친다
  const confirmDeleteChapter = (chapter: Chapter) =>
    openModal({
      size: 'sm',
      title: '화 삭제',
      alert: `'${chapter.index}화 ${chapter.title}'와 그 씬이 삭제됩니다. 복구할 수 없습니다.`,
      txtCancel: '취소',
      handleOk: () => {
        closeModal();
        deleteChapter(work.id, chapter.id);
      },
    });

  const confirmDeletePart = (part: string) =>
    openModal({
      size: 'sm',
      title: '부 삭제',
      alert: `'${part}'과(와) 거기 속한 모든 화·씬이 삭제됩니다. 복구할 수 없습니다.`,
      txtCancel: '취소',
      handleOk: () => {
        closeModal();
        deletePart(work.id, part);
        setOpenParts((s) => {
          const next = new Set(s);
          next.delete(part);
          return next;
        });
      },
    });

  const commitPartRename = (oldLabel: string, value: string) => {
    setEditingPart(null);
    if (value && value !== oldLabel) {
      renamePart(work.id, oldLabel, value);
      setOpenParts((s) => {
        const next = new Set(s);
        if (next.delete(oldLabel)) next.add(value);
        return next;
      });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pt-0.5 pb-2">
      {parts.map(({ part, chapters }) => {
        const partOpen = openParts.has(part);
        return (
          <div key={part}>
            {editingPart === part ? (
              <div className="mx-1.5 flex h-7 items-center gap-1.5 rounded-[3px] px-2.5">
                <ChevronDown className="size-3.5 shrink-0 text-muted-ink" strokeWidth={2.2} />
                <InlineEdit
                  initial={part}
                  onCommit={(v) => commitPartRename(part, v)}
                  onCancel={() => setEditingPart(null)}
                />
              </div>
            ) : (
              <div className="group mx-1.5 flex items-center rounded-[3px] transition-colors hover:bg-ink/[0.04]">
                <button
                  type="button"
                  onClick={() => togglePart(part)}
                  onDoubleClick={() => setEditingPart(part)}
                  className="flex h-7 min-w-0 flex-1 items-center gap-1.5 px-2.5 text-left text-sm font-medium text-ink"
                >
                  {partOpen ? (
                    <ChevronDown className="size-3.5 text-muted-ink" strokeWidth={2.2} />
                  ) : (
                    <ChevronRight className="size-3.5 text-faint" strokeWidth={2.2} />
                  )}
                  <span className="flex-1 truncate">{part}</span>
                </button>
                <RowMenu
                  open={menuFor === `part:${part}`}
                  onOpen={() => setMenuFor(`part:${part}`)}
                  onClose={() => setMenuFor(null)}
                  onDelete={() => confirmDeletePart(part)}
                />
              </div>
            )}

            {partOpen && (
              <>
                {chapters.map((chapter) =>
                  editingChapterId === chapter.id ? (
                    <div
                      key={chapter.id}
                      className="mx-1.5 flex h-7 items-center gap-1.5 rounded-[3px] pr-2.5 pl-5"
                    >
                      <span className="shrink-0 text-sm text-faint">{chapter.index}화 ·</span>
                      <InlineEdit
                        initial={chapter.title}
                        onCommit={(v) => {
                          renameChapter(work.id, chapter.id, v || '새 화');
                          setEditingChapterId(null);
                        }}
                        onCancel={() => setEditingChapterId(null)}
                      />
                    </div>
                  ) : (
                    // 회차 클릭 = 첫 씬 편집으로 바로 이동(씬 노드는 트리에 두지 않음). 더블클릭은 제목 편집.
                    <div
                      key={chapter.id}
                      className={cn(
                        'group mx-1.5 flex items-center rounded-[3px] transition-colors',
                        activeChapterId === chapter.id ? 'bg-primary/10' : 'hover:bg-ink/[0.04]'
                      )}
                    >
                      <Link
                        to="/works/$workId/write/$sceneId"
                        params={{ workId: work.id, sceneId: chapter.scenes[0]?.id ?? '' }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          setEditingChapterId(chapter.id);
                        }}
                        className={cn(
                          'flex h-7 min-w-0 flex-1 items-center gap-1.5 pr-1 pl-5 text-sm',
                          activeChapterId === chapter.id
                            ? 'font-medium text-primary'
                            : 'text-ink-soft'
                        )}
                      >
                        <span className="flex-1 truncate">
                          {chapter.index}화 · {chapter.title}
                        </span>
                      </Link>
                      <RowMenu
                        open={menuFor === `ch:${chapter.id}`}
                        onOpen={() => setMenuFor(`ch:${chapter.id}`)}
                        onClose={() => setMenuFor(null)}
                        onDelete={() => confirmDeleteChapter(chapter)}
                      />
                    </div>
                  )
                )}

                {/* 새 화: 부에 속한 부차 동작 — 들여쓴 점선 고스트 버튼 */}
                <button
                  type="button"
                  onClick={() => confirmAddChapter(part)}
                  className="mt-0.5 mb-1 ml-6 flex h-[26px] w-[calc(100%-30px)] items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong text-[12px] font-medium text-muted-ink transition-colors hover:border-primary/60 hover:bg-primary/5 hover:text-primary"
                >
                  <FilePlus className="size-3.5" strokeWidth={2} />
                  <span>새 화</span>
                </button>
              </>
            )}
          </div>
        );
      })}

      {/* 새 부: 최상위 동작 — 구분선 뒤 테두리 버튼(더 굵게/넓게) */}
      <div className="mx-1.5 mt-1 border-t border-line px-0 pt-2 pb-1">
        <button
          type="button"
          onClick={confirmAddPart}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line-strong bg-surface text-[13px] font-semibold text-ink-soft transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
        >
          <FolderPlus className="size-4" strokeWidth={2} />
          <span>새 부</span>
        </button>
      </div>
    </div>
  );
}

/** 행 우측 ⋯ 메뉴 — 삭제 항목. 열리면 바깥 클릭으로 닫힌다. */
function RowMenu({
  open,
  onOpen,
  onClose,
  onDelete,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="relative mr-1 shrink-0">
      <button
        type="button"
        aria-label="더보기"
        data-open={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          open ? onClose() : onOpen();
        }}
        className="grid size-6 place-items-center rounded text-faint opacity-0 transition-opacity hover:bg-ink/[0.06] hover:text-ink-soft group-hover:opacity-100 data-[open=true]:opacity-100"
      >
        <MoreHorizontal className="size-4" strokeWidth={2} />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={(e) => {
              e.preventDefault();
              onClose();
            }}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute top-7 right-0 z-50 w-28 rounded-md border border-line bg-paper py-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                onClose();
                onDelete();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-[#c4554d] transition-colors hover:bg-[#fdebec]"
            >
              <Trash2 className="size-3.5" strokeWidth={2} />
              삭제
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** 인라인 제목 편집 input — Enter/포커스 아웃은 커밋, Escape는 취소 */
function InlineEdit({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    commit ? onCommit(value.trim()) : onCancel();
  };
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: 추가/이름변경 직후 바로 입력하도록 의도된 포커스
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      className="min-w-0 flex-1 rounded-[3px] border border-line-strong bg-paper px-1 text-sm text-ink outline-none focus:border-primary"
    />
  );
}
