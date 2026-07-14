// 작품 전체 원고 zip 다운로드(task #54) — assist.api.ts의 fetch+Bearer 토큰+401 단일-비행
// refresh 재시도 패턴을 미러링한다. 응답이 바이너리 zip이라 생성 axios SDK(고정
// responseType: 'json')로 다루지 않고 fetch를 직접 호출한다.
import { getAccessToken, useAuthStore } from '@/features/auth/store/auth.store';
import { refreshAccessToken } from '@/lib/api-interceptors';

// eco: prod 오리진 주입은 assist.api.ts와 동일하게 VITE_API_BASE_URL을 직접 읽는다.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

function exportUrl(workId: string): string {
  return `${API_BASE}/api/v1/works/${workId}/export`;
}

/** 다운로드 파일명에 쓸 수 없는 파일시스템 금지문자를 밑줄로 치환(백엔드 _sanitize_name과 동일 목적). */
function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

/** FastAPI 에러 응답(JSON `{ detail }`)을 axios 에러와 같은 모양으로 감싸 apiErrorMessage가 그대로 읽게 한다. */
async function toApiError(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => null);
  const detail = typeof body?.detail === 'string' ? body.detail : fallback;
  return Object.assign(new Error(detail), { response: { data: { detail } } });
}

/**
 * 작품 전체 원고를 zip으로 내려받아 `{workTitle}.zip`으로 저장한다.
 * 401 처리는 assist.api.ts의 streamAssist와 동일 정책(단일-비행 refresh 후 1회 재시도,
 * 재실패 시 세션 클리어 + `/auth/login` 이동).
 */
export async function downloadManuscriptZip(workId: string, workTitle: string): Promise<void> {
  const fetchWithToken = (token: string | null) =>
    fetch(exportUrl(workId), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  let res = await fetchWithToken(getAccessToken());

  if (res.status === 401) {
    let newToken: string;
    try {
      newToken = await refreshAccessToken();
    } catch {
      window.location.href = '/auth/login';
      throw new Error(`manuscript export failed: ${res.status}`);
    }

    res = await fetchWithToken(newToken);
    if (res.status === 401) {
      useAuthStore.getState().clear();
      window.location.href = '/auth/login';
      throw new Error(`manuscript export failed: ${res.status}`);
    }
  }

  if (!res.ok) {
    throw await toApiError(res, '다운로드에 실패했습니다');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeFileName(workTitle)}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
