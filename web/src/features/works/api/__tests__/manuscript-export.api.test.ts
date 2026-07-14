import { useAuthStore } from '@/features/auth/store/auth.store';
import { refreshAccessToken } from '@/lib/api-interceptors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadManuscriptZip } from '../manuscript-export.api';

// eco: assist.api.test.ts와 동일하게 refreshAccessToken(단일-비행 coordinator)에 위임할 뿐이므로
// 여기서는 그 결과(성공/실패)만 모킹해 401 처리 분기를 검증한다.
vi.mock('@/lib/api-interceptors', () => ({
  refreshAccessToken: vi.fn(),
}));

function zipResponse(blob: Blob): Response {
  return { ok: true, status: 200, blob: () => Promise.resolve(blob) } as unknown as Response;
}

function errorResponse(status: number, detail?: string): Response {
  return {
    ok: false,
    status,
    json: () => (detail ? Promise.resolve({ detail }) : Promise.reject(new Error('no body'))),
  } as unknown as Response;
}

describe('downloadManuscriptZip', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;
  let clickMock: ReturnType<typeof vi.fn<() => void>>;
  let anchorEl: HTMLAnchorElement | null;

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      accessToken: 'old-token',
      refreshToken: 'ref-token',
      user: null,
      isAuthenticated: true,
    });
    vi.mocked(refreshAccessToken).mockReset();
    // eco: jsdom의 실제 navigation을 막고 리다이렉트 여부만 관찰한다(assist.api.test.ts와 동일 관례).
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' },
    });

    createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    revokeObjectURLMock = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    });

    clickMock = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => clickMock());

    anchorEl = null;
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === 'a') anchorEl = el as HTMLAnchorElement;
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('성공 시 blob을 받아 anchor 다운로드를 트리거하고 objectURL을 정리한다', async () => {
    const blob = new Blob(['zip-bytes']);
    const fetchMock = vi.fn().mockResolvedValue(zipResponse(blob));
    vi.stubGlobal('fetch', fetchMock);

    await downloadManuscriptZip('work-1', '내 소설');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/works/work-1/export'),
      expect.objectContaining({ headers: { Authorization: 'Bearer old-token' } })
    );
    expect(createObjectURLMock).toHaveBeenCalledWith(blob);
    expect(anchorEl?.getAttribute('href')).toBe('blob:mock-url');
    expect(anchorEl?.getAttribute('download')).toBe('내 소설.zip');
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
  });

  it('작품 제목에 파일시스템 금지문자가 있으면 밑줄로 치환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(zipResponse(new Blob(['x'])));
    vi.stubGlobal('fetch', fetchMock);

    await downloadManuscriptZip('work-1', '무협/회귀:물');

    expect(anchorEl?.getAttribute('download')).toBe('무협_회귀_물.zip');
  });

  it('① 첫 fetch 401 → refresh 성공 → 새 Authorization으로 재시도해 다운로드한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(401))
      .mockResolvedValueOnce(zipResponse(new Blob(['x'])));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(refreshAccessToken).mockResolvedValue('new-token');

    await downloadManuscriptZip('work-1', '제목');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new-token');
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('');
  });

  it('② refresh 실패 → 세션 클리어 + /auth/login 이동, 재시도 없음', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(errorResponse(401));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error('refresh failed'));

    await expect(downloadManuscriptZip('work-1', '제목')).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('/auth/login');
  });

  it('③ 재시도 후에도 401 → 세션 클리어 + /auth/login 이동, 추가 재시도 없음(fetch 총 2회)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(401))
      .mockResolvedValueOnce(errorResponse(401));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(refreshAccessToken).mockResolvedValue('new-token');

    await expect(downloadManuscriptZip('work-1', '제목')).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(window.location.href).toBe('/auth/login');
  });

  it('빈 작품 400 → 응답 detail을 담은 에러를 던져 apiErrorMessage가 표면화할 수 있게 한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(400, '내보낼 원고가 없습니다'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(downloadManuscriptZip('work-1', '제목')).rejects.toMatchObject({
      response: { data: { detail: '내보낼 원고가 없습니다' } },
    });
    expect(clickMock).not.toHaveBeenCalled();
  });
});
