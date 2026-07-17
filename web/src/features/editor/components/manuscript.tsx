import { apiErrorMessage } from '@/features/auth/lib/api-error';
import { useAssistStream } from '@/features/editor/api/assist.api';
import { manuscriptApi } from '@/features/editor/api/manuscript.api';
import { toParagraphs } from '@/features/editor/lib/hydrate-chapters';
import { useWorksStore } from '@/features/shared/store/works.store';
import type { Chapter, ChapterVersion, Work } from '@/features/shared/types';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Check,
  ChevronsUpDown,
  ClipboardList,
  History,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  Pencil,
  Redo2,
  RotateCw,
  Save,
  Sparkles,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SelectionAiMenu } from './selection-ai-menu';
import { SuggestionPicker } from './suggestion-picker';
import { VersionHistoryModal } from './version-history-modal';

/** 품질 티어 — ADR-0004. 사용자는 모델명이 아닌 이 티어만 고른다. */
const QUALITY_TIERS = ['저비용', '균형', '고품질'] as const;
type QualityTier = (typeof QUALITY_TIERS)[number];

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function ManuscriptEditor({
  work,
  chapter,
}: {
  work: Work;
  chapter: Chapter;
}) {
  const [tier, setTier] = useState<QualityTier>('고품질');
  const [showHistory, setShowHistory] = useState(false);
  const [titleDraft, setTitleDraft] = useState(chapter.title);
  const [showDraft, setShowDraft] = useState(false);
  const draftRef = useRef<HTMLDivElement>(null);
  const assist = useAssistStream();
  const renameChapter = useWorksStore((s) => s.renameChapter);
  const restoreChapterVersion = useWorksStore((s) => s.restoreChapterVersion);
  const setChapterParagraphs = useWorksStore((s) => s.setChapterParagraphs);
  const extractChapterUpdates = useWorksStore((s) => s.extractChapterUpdates);

  const initialContent = chapter.paragraphs.length
    ? chapter.paragraphs.map((p) => `<p>${escapeHtml(p.text)}</p>`).join('')
    : '';

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'sw-editor font-serif text-[18.5px] leading-[1.95] text-ink min-h-[420px]',
      },
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            chars: editor.getText().replace(/\s/g, '').length,
            isBold: editor.isActive('bold'),
            isItalic: editor.isActive('italic'),
            isUnderline: editor.isActive('underline'),
            isStrike: editor.isActive('strike'),
            isH2: editor.isActive('heading', { level: 2 }),
            isBullet: editor.isActive('bulletList'),
            isOrdered: editor.isActive('orderedList'),
            isLink: editor.isActive('link'),
            canUndo: editor.can().undo(),
            canRedo: editor.can().redo(),
          }
        : null,
  });

  const chars = state?.chars ?? 0;
  const readMin = Math.max(1, Math.ceil(chars / 500));

  const runContinue = () => {
    if (!editor) return;
    const beforeCursor = editor.state.doc.textBetween(0, editor.state.selection.from, '\n');
    // 커서가 화 맨 앞이면 선행 텍스트가 비어 LLM이 400으로 거부한다(수위 거절로 오인되던 원인)
    // — 화 전체 본문으로 폴백하고, 그것마저 비면 호출하지 않는다.
    const cursorText = beforeCursor.trim()
      ? beforeCursor
      : editor.getText({ blockSeparator: '\n' });
    if (!cursorText.trim()) {
      toast.error('이어쓸 본문이 없습니다. 한두 문장을 먼저 써 주세요.');
      return;
    }
    setShowDraft(true);
    assist.start('continue', { workId: work.id, chapterId: chapter.id, payload: { cursorText } });
  };

  const dismissDraft = () => setShowDraft(false);

  // 패널이 나타날 때 화면에 보이도록 스크롤 — 긴 본문에서 반응 없음으로 오인되는 것 방지.
  useEffect(() => {
    if (showDraft) draftRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [showDraft]);

  const saveChapter = async () => {
    if (!editor) return;
    const body = editor.getText({ blockSeparator: '\n' });
    try {
      await manuscriptApi.updateChapter({
        path: { work_id: work.id, episode_id: chapter.episodeId, chapter_id: chapter.id },
        body: { body },
      });
      setChapterParagraphs(work.id, chapter.id, toParagraphs(body));
      toast.success('저장했습니다');
      // 신규 설정 추출·제안 — 저장 자체와 독립된 후속 작업이라 실패해도 저장 성공은 유지한다.
      extractChapterUpdates(work.id, chapter.id).catch((err) => {
        toast.error(apiErrorMessage(err, '설정 변경 감지에 실패했습니다'));
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, '저장하지 못했습니다. 다시 시도해 주세요.'));
    }
  };

  const commitTitle = () => {
    const title = titleDraft.trim() || '새 화';
    setTitleDraft(title);
    if (title === chapter.title) return;
    renameChapter(work.id, chapter.id, title).catch((err) => {
      toast.error(apiErrorMessage(err, '화 제목을 저장하지 못했습니다'));
    });
  };

  const restoreVersion = (version: ChapterVersion) => {
    restoreChapterVersion(work.id, chapter.id, version.id);
    editor?.commands.setContent(
      version.paragraphs.map((p) => `<p>${escapeHtml(p.text)}</p>`).join('')
    );
    toast.success('현재 버전으로 되돌렸습니다');
    setShowHistory(false);
  };

  const setLink = () => {
    if (!editor) return;
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt('링크 URL');
    if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[820px] px-12 pt-10 pb-10">
          {/* 제목 */}
          <div className="flex items-start gap-3">
            <h1 className="flex min-w-0 flex-1 items-baseline gap-2 font-serif text-[30px] font-bold leading-[1.3] tracking-[-0.01em] text-ink">
              <span className="shrink-0 text-faint">{chapter.index}화</span>
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                aria-label="챕터 제목"
                placeholder="제목 없음"
                className="min-w-0 flex-1 rounded-md bg-transparent px-1 font-serif font-bold outline-none transition-colors placeholder:text-faintest hover:bg-surface focus:bg-surface"
              />
            </h1>
            <div className="mt-1.5 flex items-center gap-1.5 text-faint">
              <Pencil className="size-[15px]" strokeWidth={2} />
              <button
                type="button"
                onClick={() => toast('전체화면 (목업)')}
                aria-label="전체화면"
                className="grid size-7 place-items-center rounded-[5px] hover:bg-surface"
              >
                <Maximize2 className="size-[15px]" strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* 액션 칩 + 품질 티어 */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ActionChip icon={Save} label="저장" onClick={saveChapter} />
            <ActionChip
              icon={ClipboardList}
              label="요약"
              onClick={() => toast('요약 생성 (목업)')}
            />
            <ActionChip
              icon={ImageIcon}
              label="장면 이미지"
              onClick={() => toast('장면 이미지 생성 (목업)')}
            />
            <ActionChip icon={RotateCw} label="다시쓰기" onClick={() => toast('다시쓰기 (목업)')} />
            <ActionChip icon={History} label="버전 기록" onClick={() => setShowHistory(true)} />

            <div className="ml-auto">
              <label className="relative flex h-9 items-center rounded-full border border-line bg-paper pl-3 pr-8 text-[13.5px] font-medium text-ink-soft">
                <Sparkles className="mr-1.5 size-[15px] text-ai" strokeWidth={2} />
                <select
                  value={tier}
                  onChange={(e) => {
                    setTier(e.target.value as QualityTier);
                    toast(`품질 티어: ${e.target.value}`);
                  }}
                  className="cursor-pointer appearance-none bg-transparent pr-1 outline-none"
                  aria-label="품질 티어"
                >
                  {QUALITY_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <ChevronsUpDown
                  className="pointer-events-none absolute right-2.5 size-[15px] text-faint"
                  strokeWidth={2}
                />
              </label>
            </div>
          </div>

          {/* AI 이어쓰기 */}
          <button
            type="button"
            onClick={runContinue}
            disabled={assist.isStreaming}
            className="mt-3 flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-60"
          >
            <Sparkles className="size-[17px]" strokeWidth={2} />
            AI 이어쓰기
          </button>

          {/* 서식 툴바 */}
          <div className="mt-6 flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface-soft px-2 py-1.5">
            <ToolBtn
              icon={Undo2}
              label="실행 취소"
              disabled={!state?.canUndo}
              onClick={() => editor?.chain().focus().undo().run()}
            />
            <ToolBtn
              icon={Redo2}
              label="다시 실행"
              disabled={!state?.canRedo}
              onClick={() => editor?.chain().focus().redo().run()}
            />
            <Divider />
            <ToolBtn
              icon={Bold}
              label="굵게"
              active={state?.isBold}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            />
            <ToolBtn
              icon={Italic}
              label="기울임"
              active={state?.isItalic}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            />
            <ToolBtn
              icon={UnderlineIcon}
              label="밑줄"
              active={state?.isUnderline}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
            />
            <ToolBtn
              icon={Strikethrough}
              label="취소선"
              active={state?.isStrike}
              onClick={() => editor?.chain().focus().toggleStrike().run()}
            />
            <Divider />
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              className={cn(
                'flex h-8 items-center rounded-md px-2 text-[13px] font-bold transition-colors',
                state?.isH2 ? 'bg-primary/10 text-primary' : 'text-ink-soft hover:bg-surface'
              )}
            >
              H2
            </button>
            <Divider />
            <ToolBtn
              icon={List}
              label="글머리표 목록"
              active={state?.isBullet}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            />
            <ToolBtn
              icon={ListOrdered}
              label="번호 목록"
              active={state?.isOrdered}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            />
            <Divider />
            <ToolBtn icon={Link2} label="링크" active={state?.isLink} onClick={setLink} />
          </div>

          {/* 본문 에디터 */}
          <div className="mt-6" data-testid="editor-container">
            <EditorContent editor={editor} />
            <SelectionAiMenu editor={editor} workId={work.id} chapterId={chapter.id} />
          </div>

          {showDraft && (
            <div ref={draftRef} className="mt-4">
              <SuggestionPicker
                rawText={assist.text}
                isStreaming={assist.isStreaming}
                error={assist.error}
                onApply={(text) => {
                  editor?.chain().focus().insertContent(text).run();
                  setShowDraft(false);
                }}
                onCancel={dismissDraft}
              />
            </div>
          )}
        </div>
      </div>

      {/* 하단 상태바 */}
      <div className="flex h-11 shrink-0 items-center gap-3 border-t border-line px-5 text-[12.5px] text-faint">
        <span className="font-semibold text-ink-soft">{chars}</span>
        <span className="hidden h-3 w-px bg-line sm:block" />
        <span className="hidden items-center gap-2 sm:flex">
          <span className="h-1 w-24 overflow-hidden rounded-full bg-line">
            <span className="block h-full w-[8%] rounded-full bg-primary" />
          </span>
          8%
        </span>
        <span className="hidden md:inline">예상 읽기 {readMin}분</span>
        <span className="ml-auto flex items-center gap-1.5 text-success">
          <Check className="size-[14px]" strokeWidth={2.4} />
          자동 저장 완료
        </span>
        <span className="hidden h-3 w-px bg-line sm:block" />
        <span className="hidden sm:inline">오후 2:34</span>
        <Link
          to="/works/$workId/read/$chapterId"
          params={{ workId: work.id, chapterId: chapter.id }}
          title="읽기 모드로 전환"
          className="flex h-7 items-center gap-1.5 rounded-[5px] border border-line px-2.5 font-medium text-ink-soft transition-colors hover:bg-surface"
        >
          <Pencil className="size-[13px]" strokeWidth={2} />
          집필 모드
          <ChevronsUpDown className="size-[13px] text-faint" strokeWidth={2} />
        </Link>
        <button
          type="button"
          onClick={() => toast('전체화면 (목업)')}
          aria-label="전체화면"
          className="grid size-7 place-items-center rounded-[5px] hover:bg-surface"
        >
          <Maximize2 className="size-[14px]" strokeWidth={2} />
        </button>
      </div>

      {showHistory && (
        <VersionHistoryModal
          chapter={chapter}
          currentText={chapter.paragraphs.map((p) => p.text).join('\n')}
          onRestore={restoreVersion}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

function ActionChip({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Save;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-paper px-3.5 text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-surface"
    >
      <Icon className="size-[15px]" strokeWidth={2} />
      {label}
    </button>
  );
}

function ToolBtn({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: typeof Bold;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-8 place-items-center rounded-md transition-colors',
        active ? 'bg-primary/10 text-primary' : 'text-ink-soft hover:bg-surface',
        disabled && 'cursor-default opacity-30 hover:bg-transparent'
      )}
    >
      <Icon className="size-[17px]" strokeWidth={2} />
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-line" />;
}
