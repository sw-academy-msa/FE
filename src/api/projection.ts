/**
 * Query 조회 모델 반영 대기 (docs/api-spec.md 0절: 조회 모델은 Kafka로 반영되어 지연될 수 있다).
 * 방금 쓴 데이터(문의 등록 직후 상세 등)를 읽을 때 404는 아직 반영 전일 수 있어 잠시 뒤 다시 읽는다.
 * 네트워크 단절·서버 오류 같은 일시 실패는 한 번만 다시 시도한다. 그 밖의 오류와 취소는 바로 알린다.
 */
import { ApiError } from './client';

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException('요청이 취소됐어요.', 'AbortError')); return; }
  const t = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms);
  const stop = () => { clearTimeout(t); reject(new DOMException('요청이 취소됐어요.', 'AbortError')); };
  signal?.addEventListener('abort', stop, { once: true });
});

/** 404 재시도 간격(합계 약 4초). 일시 실패는 첫 간격 뒤 한 번만 */
export const PROJECTION_DELAYS = [500, 1000, 2500];

export async function retryProjection<T>(load: () => Promise<T>, signal?: AbortSignal, delays = PROJECTION_DELAYS): Promise<T> {
  let transientUsed = false;
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new DOMException('요청이 취소됐어요.', 'AbortError');
    try { return await load(); }
    catch (e) {
      if (!(e instanceof ApiError) || attempt >= delays.length) throw e;
      const notYet = e.status === 404, transient = e.status === 0 || e.status >= 500;
      if (!notYet && !(transient && !transientUsed)) throw e;
      if (transient) transientUsed = true;
      await wait(delays[attempt], signal);
    }
  }
}
