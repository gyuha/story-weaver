import type { Entity } from '@/features/shared/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockArtStyles = vi.fn();
const mockWorkArtStyle = vi.fn();
const mockImages = vi.fn();
const mockUpdateImage = vi.fn();
const mockStream = vi.fn();
const mockFetchImageObjectUrl = vi.fn();

vi.mock('@/features/world-bible/api/entity-images.api', () => ({
  imageGenerationApi: {
    artStyles: (...args: unknown[]) => mockArtStyles(...args),
    workArtStyle: (...args: unknown[]) => mockWorkArtStyle(...args),
    images: (...args: unknown[]) => mockImages(...args),
    updateImage: (...args: unknown[]) => mockUpdateImage(...args),
  },
  apiImageSrc: (path: string) => path,
  // 설정 이미지는 테넌트 가드가 걸려 `<img src>`로 못 그린다 — AuthedImage가 이 함수로
  // 토큰을 실어 받아 objectURL을 만든다. 목은 경로를 그대로 돌려줘 alt/역할 단정이 통하게 한다.
  fetchImageObjectUrl: (...args: unknown[]) => mockFetchImageObjectUrl(...args),
  streamGenerateEntityImage: (...args: unknown[]) => mockStream(...args),
}));

// 실제 라우터 없이 Link를 <a>로 렌더 — work-shell.test.tsx와 동일한 패턴.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
      className,
    }: {
      to: string;
      params?: Record<string, string>;
      children: ReactNode;
      className?: string;
    }) => {
      const href = params ? to.replace(/\$(\w+)/g, (_, key) => params[key] ?? '') : to;
      return (
        <a href={href} className={className}>
          {children}
        </a>
      );
    },
  };
});

import { EntityImageSection } from '../entity-image-section';

const WORK_ID = 'w1';

const CHARACTER_ENTITY: Entity = {
  id: 'e1',
  type: '인물',
  name: '서리검',
  emoji: '🗡️',
  summary: '냉정한 검객',
  fields: [],
};

const ART_STYLE_CATALOG = [
  { id: 'ink', label: '수묵화', samples: { character: '/s1' } },
  { id: 'webtoon', label: '웹툰', samples: { character: '/s2' } },
];

function renderSection(entity: Entity = CHARACTER_ENTITY) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EntityImageSection workId={WORK_ID} entity={entity} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockArtStyles.mockResolvedValue(ART_STYLE_CATALOG);
  mockWorkArtStyle.mockResolvedValue({ artStyleId: 'ink', artStyleNote: null });
  mockImages.mockResolvedValue([]);
  mockUpdateImage.mockResolvedValue({});
  mockFetchImageObjectUrl.mockImplementation((path: string) => Promise.resolve(`blob:${path}`));
});

describe('EntityImageSection', () => {
  it('설정 이미지를 인증 fetch로 받아 그린다 — 경로를 src에 직접 넣지 않는다', async () => {
    // 이것이 목표 명제다. `<img src="/api/v1/works/…/images/…">`는 브라우저가
    // Authorization 헤더를 보낼 수 없어 401로 깨진다(실측: 인증 없이 401, 토큰 있으면 200).
    // "이미지 엘리먼트가 존재한다"만 보면 이 결함을 놓친다 — 실제로 그렇게 놓쳤다.
    mockImages.mockResolvedValue([
      {
        id: 'img-a',
        imageUrl: '/api/v1/works/w1/images/img-a',
        isPrimary: true,
        visualDescription: null,
        templateId: 'ink-character',
        createdAt: 'now',
      },
      {
        id: 'img-b',
        imageUrl: '/api/v1/works/w1/images/img-b',
        isPrimary: false,
        visualDescription: null,
        templateId: 'ink-character',
        createdAt: 'now',
      },
    ]);
    renderSection(CHARACTER_ENTITY);

    await waitFor(() => expect(mockFetchImageObjectUrl).toHaveBeenCalled());
    const requested = mockFetchImageObjectUrl.mock.calls.map((c) => c[0]);
    expect(requested).toContain('/api/v1/works/w1/images/img-a');
    expect(requested).toContain('/api/v1/works/w1/images/img-b');

    // 그리고 어떤 img도 원본 API 경로를 src로 갖지 않는다(전부 objectURL이어야 한다).
    await waitFor(() => {
      const srcs = screen.getAllByRole('img').map((el) => el.getAttribute('src') ?? '');
      expect(srcs.length).toBeGreaterThan(0);
      for (const src of srcs) expect(src.startsWith('/api/v1/')).toBe(false);
    });
  });

  it('템플릿 썸네일 그리드가 없다', async () => {
    renderSection(CHARACTER_ENTITY);
    await screen.findByText('이 작품의 화풍: 수묵화');
    expect(screen.queryByText('템플릿')).not.toBeInTheDocument();
    expect(screen.queryByText('웹툰')).not.toBeInTheDocument();
  });

  it('적용될 화풍을 한 줄로 보여주고 바꾸기 링크가 스타일 화면을 가리킨다', async () => {
    renderSection(CHARACTER_ENTITY);
    expect(await screen.findByText('이 작품의 화풍: 수묵화')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '바꾸기' })).toHaveAttribute(
      'href',
      '/works/w1/art-style'
    );
  });

  it('화풍이 없으면 생성 버튼 대신 유도가 보인다', async () => {
    mockWorkArtStyle.mockResolvedValue({ artStyleId: null, artStyleNote: null });
    renderSection(CHARACTER_ENTITY);

    expect(await screen.findByText(/먼저 이 작품의 화풍을 정해 주세요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '이미지 스타일' })).toHaveAttribute(
      'href',
      '/works/w1/art-style'
    );
    expect(screen.queryByRole('button', { name: '생성' })).not.toBeInTheDocument();
  });

  it('이미지가 0장이면 이모지로 표시한다', async () => {
    renderSection(CHARACTER_ENTITY);
    await waitFor(() => expect(mockImages).toHaveBeenCalled());
    expect(screen.getByText('🗡️')).toBeInTheDocument();
  });

  it('생성 요청 바디에 templateId가 없다', async () => {
    const user = userEvent.setup();
    mockStream.mockImplementation(async function* () {
      yield { event: 'stage', data: 'prompt' };
    });

    renderSection(CHARACTER_ENTITY);
    await user.click(await screen.findByRole('button', { name: '생성' }));

    await waitFor(() => expect(mockStream).toHaveBeenCalled());
    const [params] = mockStream.mock.calls[0];
    expect(params).not.toHaveProperty('templateId');
    expect(params).toEqual({ workId: WORK_ID, entityId: 'e1', extraPrompt: '' });
  });

  it('생성을 누르면 SSE 단계 진행이 보인다', async () => {
    const user = userEvent.setup();
    const releaseStage: { current: (() => void) | null } = { current: null };
    mockStream.mockImplementation(async function* () {
      yield { event: 'stage', data: 'prompt' };
      yield { event: 'stage', data: 'image' };
      await new Promise<void>((resolve) => {
        releaseStage.current = resolve;
      });
    });

    renderSection(CHARACTER_ENTITY);
    await user.click(await screen.findByRole('button', { name: '생성' }));

    expect(await screen.findByText('이미지 생성 중…')).toBeInTheDocument();
    expect(screen.getByTestId('image-generating-tile')).toBeInTheDocument();
    releaseStage.current?.();
  });

  it('취소하면 스트리밍이 중단되지만 이미 만들어진 이미지는 목록에 남는다', async () => {
    const user = userEvent.setup();
    let committedImages: unknown[] = [];
    mockImages.mockImplementation(() => Promise.resolve(committedImages));

    mockStream.mockImplementation(async function* (
      _params: unknown,
      init?: { signal?: AbortSignal }
    ) {
      yield { event: 'stage', data: 'prompt' };
      yield { event: 'stage', data: 'image' };
      // 백엔드가 이미지를 커밋한 뒤 image 이벤트를 보내는 시점을 재현한다.
      committedImages = [
        {
          id: 'img1',
          imageUrl: '/img1.jpg',
          isPrimary: true,
          visualDescription: null,
          templateId: 't1',
          createdAt: 'now',
        },
      ];
      yield { event: 'image', data: JSON.stringify({ imageId: 'img1', isPrimary: true }) };
      yield { event: 'stage', data: 'description' };
      // description 단계에서 취소되면 abort가 실제로 이 대기를 reject해야 한다(부작용 재현).
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    renderSection(CHARACTER_ENTITY);
    await user.click(await screen.findByRole('button', { name: '생성' }));

    await waitFor(() => expect(screen.getByTestId('image-generating-tile')).toBeInTheDocument());
    // 이미지 이벤트로 목록이 갱신되어 실제 썸네일이 이미 남아 있다.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: '대표 이미지' })).toHaveLength(1)
    );

    await user.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() =>
      expect(screen.queryByTestId('image-generating-tile')).not.toBeInTheDocument()
    );
    expect(screen.getAllByRole('button', { name: '대표 이미지' })).toHaveLength(1);
  });

  it('429 한도 오류는 시스템 오류가 아니라 안내로 표시된다', async () => {
    const user = userEvent.setup();
    mockStream.mockImplementation(async function* () {
      yield { event: 'stage', data: 'prompt' };
      yield { event: 'stage', data: 'image' };
      yield {
        event: 'error',
        data: '지금 이미지 생성이 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.',
      };
    });

    renderSection(CHARACTER_ENTITY);
    await user.click(await screen.findByRole('button', { name: '생성' }));

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('한도에 걸렸습니다');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('409(화풍 미지정) 오류는 시스템 오류가 아니라 안내로 표시된다', async () => {
    const user = userEvent.setup();
    mockStream.mockImplementation(async function* () {
      // 409는 스트림을 시작하기 전에 거부되므로(사전 검증), 실제 코드도 yield 전에 던진다.
      await Promise.reject(
        new Error('작품의 화풍이 정해지지 않았습니다. 먼저 이미지 스타일을 정해 주세요.')
      );
      yield { event: 'message' as const, data: '' };
    });

    renderSection(CHARACTER_ENTITY);
    await user.click(await screen.findByRole('button', { name: '생성' }));

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('작품의 화풍이 정해지지 않았습니다');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('대표 이미지를 크게 보여주고 썸네일 클릭이 isPrimary: true PATCH를 보낸다', async () => {
    const user = userEvent.setup();
    mockImages.mockResolvedValue([
      {
        id: 'img1',
        imageUrl: '/img1.jpg',
        isPrimary: true,
        visualDescription: '검은 장발',
        templateId: 't1',
        createdAt: 'now',
      },
      {
        id: 'img2',
        imageUrl: '/img2.jpg',
        isPrimary: false,
        visualDescription: null,
        templateId: 't1',
        createdAt: 'now',
      },
    ]);

    renderSection(CHARACTER_ENTITY);
    expect(await screen.findByAltText('서리검')).toBeInTheDocument();
    const target = screen.getByRole('button', { name: '대표로 지정' });
    await user.click(target);

    expect(mockUpdateImage).toHaveBeenCalledWith(WORK_ID, 'img2', { isPrimary: true });
  });

  it('묘사가 없으면 안내 문구를 보여준다', async () => {
    mockImages.mockResolvedValue([
      {
        id: 'img1',
        imageUrl: '/img1.jpg',
        isPrimary: true,
        visualDescription: null,
        templateId: 't1',
        createdAt: 'now',
      },
    ]);

    renderSection(CHARACTER_ENTITY);
    expect(await screen.findByText('이 이미지에는 묘사가 없습니다.')).toBeInTheDocument();
  });

  it('시각 묘사를 편집하고 저장하면 visualDescription PATCH를 보낸다', async () => {
    const user = userEvent.setup();
    mockImages.mockResolvedValue([
      {
        id: 'img1',
        imageUrl: '/img1.jpg',
        isPrimary: true,
        visualDescription: '검은 장발',
        templateId: 't1',
        createdAt: 'now',
      },
    ]);

    renderSection(CHARACTER_ENTITY);
    await user.click(await screen.findByRole('button', { name: '수정' }));

    const textarea = screen.getByLabelText('시각 묘사 편집');
    await user.clear(textarea);
    await user.type(textarea, '은발로 수정됨');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(mockUpdateImage).toHaveBeenCalledWith(WORK_ID, 'img1', {
      visualDescription: '은발로 수정됨',
    });
  });
});
