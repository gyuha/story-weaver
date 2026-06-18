import { client } from '@/api/client.gen';

// 요청 인터셉터 — 현재는 목업 인증이라 토큰 주입이 없다.
// 실제 세션/토큰 도입(Phase 3) 시 여기서 Authorization 헤더를 주입하고
// 401 응답 인터셉터(토큰 갱신)를 추가한다.
client.instance.interceptors.request.use((config) => config);
