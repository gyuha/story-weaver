import { useWorksStore } from '@/features/shared/store/works.store';
import { worksQueries } from '@/features/works/api/works.api';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toWork } from './work-mapping';

/** 작품 목록을 서버에서 조회해 works 스토어의 works를 하이드레이션한다. */
export function useHydrateWorks() {
  const setWorks = useWorksStore((s) => s.setWorks);
  const { data, isPending, isError } = useQuery(worksQueries.list());

  useEffect(() => {
    if (data) setWorks(data.map(toWork));
  }, [data, setWorks]);

  return { isPending, isError };
}
