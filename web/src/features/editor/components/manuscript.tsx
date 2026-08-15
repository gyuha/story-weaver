import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { apiErrorMessage } from '@/features/auth/lib/api-error';
import { useAssistStream } from '@/features/editor/api/assist.api';
import { manuscriptApi } from '@/features/editor/api/manuscript.api';
import { toParagraphs } from '@/features/editor/lib/hydrate-chapters';
import { useWorksStore } from '@/features/shared/store/works.store';
import type { Chapter, Work } from '@/features/shared/types';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from '@tanstack/react-router';
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
  Loader2,
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
import { DraftProgressModal } from './draft-progress-modal';
import { SelectionAiMenu } from './selection-ai-menu';
import { ContinueSuggestionModal } from './suggestion-picker';
import { SummaryModal, type SummaryPhase } from './summary-modal';

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
  const [titleDraft, setTitleDraft] = useState(chapter.title);
  const [showDraft, setShowDraft] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryPhase, setSummaryPhase] = useState<SummaryPhase>('idle');
  // AI 요약 결과 — 편집란으로 흘려보낸다. null이면 저장된 요약을 쓴다.
  const [summaryDraft, setSummaryDraft] = useState<string | null>(null);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  // 늘려쓰기(요약 → 본문) 진행 중. 요약 생성과 별개의 상태로 두어야 완료 전이가 섞이지
  // 않는다 — 섞이면 요약 완료가 본문을 갈아끼운다.
  const [draftingBody, setDraftingBody] = useState(false);
  // 대체 확인을 기다리는 요약. null이면 확인창이 닫힌 상태다.
  const [pendingDraft, setPendingDraft] = useState<string | null>(null);
  const prevStreamingRef = useRef(false);
  // 요약 완료 감지용 — 제목 생성과 ref를 공유하면 서로의 전이를 훔친다.
  const prevSummaryStreamingRef = useRef(false);
  // 늘려쓰기 완료 감지용 — 위 두 ref와 공유 금지(같은 이유).
  const prevDraftStreamingRef = useRef(false);
  const assist = useAssistStream();
  const navigate = useNavigate();
  const renameChapter = useWorksStore((s) => s.renameChapter);
  const setChapterParagraphs = useWorksStore((s) => s.setChapterParagraphs);
  const saveChapterSummary = useWorksStore((s) => s.saveChapterSummary);
  const extractChapterUpdates = useWorksStore((s) => s.extractChapterUpdates);

  const initialContent = chapter.paragraphs.length
    ? chapter.paragraphs.map((p) => `<p>${escapeHtml(p.text)}</p>`).join('')
    : '';

  // 화를 떠날 때 자동 저장하기 위한 최신 본문. 언마운트 정리 시점에는 TipTap 에디터가
  // 이미 파괴됐을 수 있어(useEditor의 정리가 먼저 돈다) editor를 읽지 않고 이 ref를 쓴다.
  // 한 번도 편집하지 않으면 null로 남아 "변경 없음"을 뜻한다.
  const latestBodyRef = useRef<string | null>(null);

  // 자동 저장 토스트가 가리킬 화 이름. 제목은 편집 중 바뀔 수 있는데 언마운트 정리
  // 클로저는 마운트 시점 값을 붙잡으므로, 매 렌더마다 갱신하는 ref로 최신값을 읽는다.
  const chapterLabelRef = useRef('');
  useEffect(() => {
    chapterLabelRef.current = `${chapter.index}화 ${titleDraft || chapter.title}`;
  });

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    onUpdate: ({ editor: e }) => {
      latestBodyRef.current = e.getText({ blockSeparator: '\n' });
    },
    editorProps: {
      attributes: {
        class: 'sw-editor font-serif text-[18.5px] leading-[1.95] text-ink min-h-[420px]',
      },
    },
  });

  // 화를 떠날 때 자동 저장할지 가르는 기준값. **에디터가 초기 콘텐츠를 파싱한 결과**로
  // 시작해야 한다(리뷰 high) — TipTap/ProseMirror는 HTML 파싱 시 문단 내부 연속 공백·앞뒤
  // 공백·문단 내 리터럴 개행을 정규화한다(실측 확인). 원본 문단 텍스트를 그대로 join하면
  // 편집 없이도 editor.getText()와 어긋나 "미저장"으로 오탐하고, 그 오탐이 불필요한
  // 선저장을 일으켜 원본의 공백 서식을 정규화된 값으로 영구히 덮어쓴다. 이후 수동 저장·
  // 되돌리기가 성공할 때마다 그 결과로 갱신한다 — ref라 갱신해도 리렌더를 유발하지 않는다.
  const initialBodyRef = useRef(
    editor
      ? editor.getText({ blockSeparator: '\n' })
      : chapter.paragraphs.map((p) => p.text).join('\n')
  );

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
    setGeneratingTitle(false); // 이어쓰기 시작은 진행 중이던 제목 생성 스트림을 대체한다
    setShowDraft(true);
    assist.start('continue', { workId: work.id, chapterId: chapter.id, payload: { cursorText } });
  };

  const dismissDraft = () => {
    assist.stop();
    setShowDraft(false);
  };

  // `요약` 칩은 **생성하지 않고 모달만 연다** — 저장된 요약을 확인하고 닫는 것이 흔한
  // 경우이므로, 열자마자 토큰을 태우지 않는다. 생성은 모달 안의 `요약`/`다시 요약`이 한다.
  const openSummary = () => {
    setShowDraft(false); // 이어쓰기와 같은 스트림을 쓰므로 그 모달을 먼저 닫는다
    setSummaryPhase('idle');
    setSummaryDraft(null);
    setShowSummary(true);
  };

  // 모달에서 `요약`/`다시 요약`을 눌렀을 때만 실제 생성한다. 결과는 `적용`을 눌러야
  // 저장된다 — 요약은 덮어쓰기라 확인 없이 기존 요약을 날리면 되돌릴 수 없다.
  const runSummary = () => {
    if (!editor) return;
    const text = editor.getText({ blockSeparator: '\n' });
    if (!text.trim()) {
      toast.error('요약할 본문이 없습니다. 몇 문장을 먼저 써 주세요.');
      return;
    }
    setSummaryPhase('generating');
    assist.start('summary', { workId: work.id, chapterId: chapter.id, payload: { text } });
  };

  // 늘려쓰기 중단. **플래그를 `stop()`보다 먼저 끈다** — `stop()`은 abort 뒤
  // `finally`에서 isStreaming을 내리므로 완료 전이가 실제로 발생하고, 플래그가 남아
  // 있으면 쓰다 만 생성물이 본문을 덮어쓴다. 플래그가 진행 다이얼로그의 `open`이기도
  // 해서, 이 한 줄이 중단과 다이얼로그 닫힘을 함께 처리한다.
  const cancelDraft = () => {
    setDraftingBody(false);
    assist.stop();
  };

  // 편집란의 요약을 근거로 이 화의 본문을 생성한다(늘려쓰기). 생성 결과는 완료 시
  // 본문 전체를 **대체**하므로, 원고가 이미 있으면 확인을 먼저 받는다 — `버전 기록`은
  // 아직 목업이라 되돌릴 수단이 에디터의 되돌리기(⌘Z)뿐이다.
  const runDraft = (summary: string) => {
    if (!summary.trim()) {
      toast.error('늘려쓸 요약이 없습니다. 요약을 먼저 쓰거나 생성해 주세요.');
      return;
    }
    // 편집 중인 요약으로 생성하므로, 그 요약을 먼저 저장한다 — 생성 근거와 저장된
    // 요약이 어긋나면 나중에 왜 이런 본문이 나왔는지 되짚을 수 없다.
    saveChapterSummary(work.id, chapter.id, summary).catch((err) => {
      toast.error(apiErrorMessage(err, '요약을 저장하지 못했습니다'));
    });

    if (chapter.paragraphs.length) {
      setPendingDraft(summary); // 잃을 원고가 있으면 확인을 먼저 받는다
      return;
    }
    startDraft(summary); // 빈 화는 확인이 방해만 된다
  };

  const startDraft = (summary: string) => {
    setDraftingBody(true);
    // 요약 모달은 곧바로 닫는다 — 생성이 끝날 때까지 붙잡아 두면 본문이 가려진다.
    // 진행 표시와 중단 수단은 `draftingBody`에 묶인 진행 다이얼로그가 이어받는다.
    setShowSummary(false);
    assist.start('draft', { workId: work.id, chapterId: chapter.id, payload: { text: summary } });
  };

  // 현재 화 라이브 본문을 근거로 화 제목 1개를 생성해 제목 입력란에 채운다(저장은 기존 blur→commitTitle).
  const generateTitle = () => {
    if (!editor) return;
    const text = editor.getText({ blockSeparator: '\n' });
    if (!text.trim()) {
      toast.error('제목을 지을 본문이 없습니다. 몇 문장을 먼저 써 주세요.');
      return;
    }
    setShowDraft(false); // 제목 생성은 이어쓰기 제안 패널과 같은 스트림을 쓰므로 패널을 닫는다
    setGeneratingTitle(true);
    assist.start('title', { workId: work.id, chapterId: chapter.id, payload: { text } });
  };

  // 요약 생성 완료를 감지해 결과를 **편집란으로 흘려보낸다**. 별도 "적용 대기" 단계를
  // 두지 않는 이유: 편집란에 들어오면 작가가 손볼 수 있고, `저장` 버튼이 확인 역할을
  // 그대로 한다(단계가 하나 줄어든다). 실패하면 편집 내용을 건드리지 않는다.
  useEffect(() => {
    const finished = prevSummaryStreamingRef.current && !assist.isStreaming;
    prevSummaryStreamingRef.current = assist.isStreaming;
    if (!finished || summaryPhase !== 'generating') return;
    setSummaryPhase('idle');
    if (!assist.error && assist.text.trim()) setSummaryDraft(assist.text);
  }, [assist.isStreaming, assist.error, assist.text, summaryPhase]);

  // 늘려쓰기 완료를 감지해 본문을 **한 번에** 대체한다. 조각조각 넣지 않는 이유: 한 번의
  // setContent면 에디터의 되돌리기 한 번으로 원상복구되기 때문이다.
  useEffect(() => {
    const finished = prevDraftStreamingRef.current && !assist.isStreaming;
    prevDraftStreamingRef.current = assist.isStreaming;
    if (!finished || !draftingBody) return;
    setDraftingBody(false);
    if (assist.error) {
      toast.error('본문 생성에 실패했습니다. 다시 시도해 주세요.');
      return;
    }
    const paragraphs = assist.text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!paragraphs.length) return;
    editor?.commands.setContent(paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join(''));
    toast.success('본문에 반영했습니다 — 되돌리려면 편집기의 되돌리기');
  }, [assist.isStreaming, assist.text, assist.error, draftingBody, editor]);

  // useAssistStream엔 완료 콜백이 없어, 스트리밍 true→false 전이로 제목 생성 완료를 감지한다.
  useEffect(() => {
    const finished = prevStreamingRef.current && !assist.isStreaming;
    prevStreamingRef.current = assist.isStreaming;
    if (!finished || !generatingTitle) return;
    setGeneratingTitle(false);
    if (assist.error) {
      toast.error('제목 생성에 실패했습니다. 다시 시도해 주세요.');
      return;
    }
    // 후처리: 첫 줄만 취하고 양끝 따옴표·공백 제거.
    const cleaned = assist.text
      .split('\n')[0]
      .replace(/^["'“”‘’「」『』\s]+|["'“”‘’「」『』\s]+$/g, '');
    if (!cleaned) return;
    setTitleDraft(cleaned);
    // 생성 결과는 입력창 표시에 그치지 않고 곧바로 저장한다(blur를 기다리지 않음).
    if (cleaned !== chapter.title) {
      renameChapter(work.id, chapter.id, cleaned).catch((err) => {
        toast.error(apiErrorMessage(err, '화 제목을 저장하지 못했습니다'));
      });
    }
  }, [
    assist.isStreaming,
    assist.text,
    assist.error,
    generatingTitle,
    chapter.title,
    chapter.id,
    work.id,
    renameChapter,
  ]);

  // 화를 떠날 때 편집분을 잃지 않도록 자동 저장한다. editor-screen이 `key={chapter.id}`로
  // 화마다 새로 마운트하므로, 이 정리 함수가 트리에서 다른 화 클릭·새 화 추가·읽기 모드
  // 전환·뒤로가기까지 모든 이탈 경로를 덮는다.
  //
  // 수동 저장(`saveChapter`)과 둘이 다르다: ① 변경이 없으면 아무것도 하지 않는다
  // ② 설정 추출(`extractChapterUpdates`)을 부르지 않는다 — LLM 호출이라 화를 옮길 때마다
  // 사용량 한도를 먹는다. 설정 추출은 작가가 명시적으로 저장할 때만 돈다.
  // 성공 토스트는 띄우되 어느 화가 저장됐는지 밝힌다 — 이미 다른 화로 넘어간 뒤라
  // "저장했습니다"만으로는 무엇이 저장됐는지 알 수 없다. 변경이 있을 때만 뜨므로
  // 화를 둘러보기만 할 때는 조용하다.
  //
  // 이미 화면을 떠난 뒤라 await할 수 없다(fire-and-forget). 실패하면 토스트로 알린다 —
  // 그 경우 편집분은 복구되지 않으므로, 확실히 남겨야 할 때는 수동 저장을 쓴다.
  useEffect(() => {
    return () => {
      const body = latestBodyRef.current;
      if (body === null || body === initialBodyRef.current) return;
      const label = chapterLabelRef.current;
      manuscriptApi
        .updateChapter({
          path: { work_id: work.id, episode_id: chapter.episodeId, chapter_id: chapter.id },
          body: { body },
        })
        .then(() => {
          setChapterParagraphs(work.id, chapter.id, toParagraphs(body));
          toast.success(`'${label}' 저장했습니다`);
        })
        .catch((err) => {
          toast.error(apiErrorMessage(err, `'${label}'을(를) 자동 저장하지 못했습니다`));
        });
    };
    // 화가 바뀌면 컴포넌트 자체가 새로 마운트되므로 의존성은 마운트 시점 값으로 충분하다.
    // 제목은 편집 중 바뀔 수 있어 의존성이 아니라 ref로 최신값을 읽는다(위 참조).
  }, [work.id, chapter.id, chapter.episodeId, setChapterParagraphs]);

  const saveChapter = async () => {
    if (!editor) return;
    const body = editor.getText({ blockSeparator: '\n' });
    try {
      await manuscriptApi.updateChapter({
        path: { work_id: work.id, episode_id: chapter.episodeId, chapter_id: chapter.id },
        body: { body },
      });
      setChapterParagraphs(work.id, chapter.id, toParagraphs(body));
      initialBodyRef.current = body; // 방금 저장한 본문이 새 기준값 — 떠날 때 중복 PATCH를 막는다
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

  // 버전 기록 페이지로 이동한다. 미저장 편집분이 있으면 **먼저 저장을 await한다** — 페이지가
  // "현재 본문 == 최신 버전"을 전제로 diff를 보여주므로, 저장하지 않고 이동하면 작가는 자기
  // 편집분이 빠진 비교를 보게 된다. 저장이 실패하면 이동하지 않는다(편집분이 화면에 남아
  // 있어야 다시 시도할 수 있다). 저장 성공 시 `initialBodyRef`를 갱신하므로 이동으로 인한
  // 언마운트 정리가 같은 본문을 한 번 더 PATCH하지 않는다 — 기존 기계장치를 그대로 쓴다.
  const openVersions = async () => {
    const currentText = editor?.getText({ blockSeparator: '\n' }) ?? '';
    if (currentText !== initialBodyRef.current) {
      try {
        await manuscriptApi.updateChapter({
          path: { work_id: work.id, episode_id: chapter.episodeId, chapter_id: chapter.id },
          body: { body: currentText },
        });
      } catch (err) {
        toast.error(apiErrorMessage(err, '버전 기록을 열기 전 저장하지 못했습니다'));
        return;
      }
      setChapterParagraphs(work.id, chapter.id, toParagraphs(currentText));
      initialBodyRef.current = currentText;
    }
    navigate({
      to: '/works/$workId/versions/$chapterId',
      params: { workId: work.id, chapterId: chapter.id },
    });
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
              <button
                type="button"
                onClick={generateTitle}
                disabled={generatingTitle}
                aria-label="AI 제목 생성"
                title="AI 제목 생성"
                className="grid size-7 place-items-center rounded-[5px] hover:bg-surface disabled:cursor-default disabled:opacity-50"
              >
                {generatingTitle ? (
                  <Loader2 className="size-[15px] animate-spin text-ai" strokeWidth={2} />
                ) : (
                  <Sparkles className="size-[15px] text-ai" strokeWidth={2} />
                )}
              </button>
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
            <ActionChip icon={ClipboardList} label="요약" onClick={openSummary} />
            <ActionChip
              icon={ImageIcon}
              label="장면 이미지"
              onClick={() => toast('장면 이미지 생성 (목업)')}
            />
            <ActionChip icon={RotateCw} label="다시쓰기" onClick={() => toast('다시쓰기 (목업)')} />
            <ActionChip icon={History} label="버전 기록" onClick={openVersions} />

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
        </div>
      </div>

      <ContinueSuggestionModal
        open={showDraft}
        title="AI 이어쓰기"
        rawText={assist.text}
        isStreaming={assist.isStreaming}
        error={assist.error}
        onApply={(text) => {
          assist.stop();
          editor?.chain().focus().insertContent(text).run();
          setShowDraft(false);
        }}
        onCancel={dismissDraft}
      />

      <ConfirmDialog
        open={pendingDraft !== null}
        title="요약으로 본문 쓰기"
        message="기존 본문을 대체합니다. 복구할 수 없습니다. 계속할까요?"
        onConfirm={() => {
          const summary = pendingDraft;
          setPendingDraft(null);
          if (summary) startDraft(summary);
        }}
        onCancel={() => setPendingDraft(null)}
      />

      <DraftProgressModal open={draftingBody} onCancel={cancelDraft} />

      <SummaryModal
        open={showSummary}
        existingSummary={summaryDraft ?? chapter.summary}
        phase={draftingBody ? 'generating' : summaryPhase}
        error={assist.error}
        onGenerate={runSummary}
        onDraft={runDraft}
        onSave={(text) => {
          // 모달은 닫지 않는다 — 연달아 손보는 흐름을 끊지 않는다.
          saveChapterSummary(work.id, chapter.id, text)
            .then(() => toast.success('요약을 저장했습니다'))
            .catch((err) => toast.error(apiErrorMessage(err, '요약을 저장하지 못했습니다')));
        }}
        onClose={() => {
          // 늘려쓰기 중에는 이 모달이 이미 닫혀 있어 여기로 오지 않는다(중단은 진행
          // 다이얼로그의 `중단` → cancelDraft). 그래도 같은 이유로 플래그를 먼저 끈다 —
          // `stop()`이 완료 전이를 만들기 때문이다.
          cancelDraft();
          setShowSummary(false);
        }}
      />

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
