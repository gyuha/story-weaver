import { useWorksStore } from '@/features/shared/store/works.store';
import type { Chapter, Scene, Work } from '@/features/shared/types';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Check,
  ChevronsUpDown,
  ClipboardList,
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
import { useState } from 'react';
import { toast } from 'sonner';

/** 품질 티어 — ADR-0004. 사용자는 모델명이 아닌 이 티어만 고른다. */
const QUALITY_TIERS = ['저비용', '균형', '고품질'] as const;
type QualityTier = (typeof QUALITY_TIERS)[number];

/** AI 초안 생성 목업 — 빈 씬을 채우거나 현재 위치에 단락을 덧댄다. */
const MOCK_DRAFT =
  '<p>그녀는 잠시 숨을 골랐다. 낯선 별빛 아래에서, 익숙한 두려움과 낯선 설렘이 동시에 차올랐다.</p><p>「돌아갈 길은 없겠지.」 유하린은 나직이 중얼거리며 한 걸음을 더 내디뎠다.</p>';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function ManuscriptEditor({
  work,
  chapter,
  scene,
}: {
  work: Work;
  chapter: Chapter;
  scene: Scene;
}) {
  const [tier, setTier] = useState<QualityTier>('고품질');
  const renameChapter = useWorksStore((s) => s.renameChapter);

  const initialContent = scene.paragraphs.length
    ? scene.paragraphs.map((p) => `<p>${escapeHtml(p.text)}</p>`).join('')
    : '';

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'sw-editor font-serif text-[16.5px] leading-[1.95] text-ink min-h-[420px]',
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

  const generateDraft = () => {
    editor?.chain().focus().insertContent(MOCK_DRAFT).run();
    toast.success('AI 초안을 생성했습니다');
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
                value={chapter.title}
                onChange={(e) => renameChapter(work.id, chapter.id, e.target.value)}
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
            <ActionChip icon={Save} label="저장" onClick={() => toast.success('저장됨 (목업)')} />
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

          {/* AI 초안 생성 */}
          <button
            type="button"
            onClick={generateDraft}
            className="mt-3 flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Sparkles className="size-[17px]" strokeWidth={2} />
            AI 초안 생성
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
          <div className="mt-6">
            <EditorContent editor={editor} />
          </div>
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
