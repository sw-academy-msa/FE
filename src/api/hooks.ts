import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './errors';
import { ApiError } from './client';

/**
 * notFound: 마지막 실패가 서버의 404(없는 리소스)였다. invalid: 400(형식이 틀린 id 등 요청값 오류)이었다.
 * 상세 화면(주소의 id로 한 건을 불러오는 조회)은 둘 다 다시 시도 대신 '찾을 수 없어요'를 보여 준다(api/live.ts retryable). useApi는 조회 전용이라 저장, 제출의 400과 섞이지 않는다
 */
export interface AsyncState<T> { data: T | undefined; loading: boolean; error: string; notFound: boolean; invalid: boolean; reload: () => void }
/**
 * 조회용: 마운트·deps 변경 시 load를 호출하고 { data, loading, error(문구), reload }를 돌려준다.
 * 언마운트·deps 변경 시 이전 요청은 취소(AbortSignal)하고 결과를 버린다.
 */
export function useApi<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[] = []): AsyncState<T> {
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: string; notFound: boolean; invalid: boolean }>({ data: undefined, loading: true, error: '', notFound: false, invalid: false });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => {
    const controller = new AbortController();
    setState(s => ({ ...s, loading: true, error: '', notFound: false, invalid: false }));
    loadRef.current(controller.signal).then(
      data => { if (!controller.signal.aborted) setState({ data, loading: false, error: '', notFound: false, invalid: false }); },
      error => { if (!controller.signal.aborted) setState(s => ({ data: s.data, loading: false, error: errorMessage(error), notFound: error instanceof ApiError && error.status === 404, invalid: error instanceof ApiError && error.status === 400 })); },
    );
    return () => controller.abort();
  }, [...deps, tick]);
  return { ...state, reload: useCallback(() => setTick(n => n + 1), []) };
}

export interface ActionState<A extends unknown[], R> { run: (...args: A) => Promise<R | undefined>; busy: boolean; error: string; clear: () => void }
/** 쓰기용(버튼 클릭): run()이 진행 중이면 busy, 실패하면 error 문구를 채우고 undefined를 돌려준다 */
export function useAction<A extends unknown[], R>(action: (...args: A) => Promise<R>): ActionState<A, R> {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const run = useCallback(async (...args: A) => {
    setBusy(true); setError('');
    try { return await action(...args); } catch (e) { setError(errorMessage(e)); return undefined; } finally { setBusy(false); }
  }, [action]);
  return { run, busy, error, clear: () => setError('') };
}
