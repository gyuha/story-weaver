// FastAPI 에러 응답에서 사람이 읽을 메시지를 뽑는다.
// detail: 문자열(예: "Email already registered") 또는 422 검증 배열([{ctx.error|msg}]).
// 추출 실패 시 fallback을 반환한다.
export function apiErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => {
        const item = d as { ctx?: { error?: string }; msg?: string };
        return item.ctx?.error ?? item.msg;
      })
      .filter((m): m is string => Boolean(m));
    if (msgs.length > 0) return msgs.join(' ');
  }
  return fallback;
}
