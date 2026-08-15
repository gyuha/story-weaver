// 테넌트 가드가 걸린 [[설정 이미지]]를 그리는 컴포넌트.
//
// `<img src="/api/v1/works/{id}/images/{id}">`는 브라우저가 Authorization 헤더를 보내지
// 못해 401로 깨진다(실측). 그래서 토큰을 실어 받은 blob의 objectURL을 src로 쓴다.
// 훅이 아니라 컴포넌트인 이유: 썸네일 스트립이 `.map()` 안에서 여러 장을 그리므로
// 항목마다 훅을 부를 수 있는 단위가 필요하다.
import { useEffect, useState } from 'react';
import { fetchImageObjectUrl } from '../api/entity-images.api';

/** 인증이 필요한 이미지 경로 → objectURL. 언마운트·경로 변경 시 해제한다. */
function useAuthedImage(path: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setSrc(null);
      return;
    }
    let objectUrl: string | null = null;
    const controller = new AbortController();

    fetchImageObjectUrl(path, { signal: controller.signal })
      .then((url) => {
        objectUrl = url;
        setSrc(url);
      })
      .catch(() => setSrc(null));

    return () => {
      controller.abort();
      // 여기서 해제하지 않으면 카드를 옮길 때마다 blob이 쌓인다.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return src;
}

export function AuthedImage({
  path,
  alt,
  className,
  fallback,
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
  /** 로딩 중·실패 시 자리를 지킬 요소 (없으면 빈 칸) */
  fallback?: React.ReactNode;
}) {
  const src = useAuthedImage(path);
  if (!src) return <>{fallback ?? <div className={className} />}</>;
  return <img src={src} alt={alt} className={className} />;
}
