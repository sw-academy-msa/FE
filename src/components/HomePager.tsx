import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { HOME_PAGE_SIZE, pageDots } from '../homeList';

const GAP = 16;
/**
 * 상품 10개씩 좌우로 넘기는 페이지. 가로 스크롤 스냅(브라우저 기본 스와이프)이라 세로 스크롤과 겹치지 않고 아이폰 관성 스와이프도 그대로다.
 * 아래 점(현재 페이지 강조, 최대 7개)과 이전/다음 버튼으로도 넘긴다(키보드, 화면 낭독기). 보던 페이지는 부모가 주소에 둔다.
 */
export function HomePager<T extends { id: string }>({ items, page, onPage, render }: { items: T[]; page: number; onPage: (page: number) => void; render: (item: T) => ReactNode }) {
  const pages = Array.from({ length: Math.max(1, Math.ceil(items.length / HOME_PAGE_SIZE)) }, (_, i) => items.slice(i * HOME_PAGE_SIZE, (i + 1) * HOME_PAGE_SIZE));
  const count = pages.length, cur = Math.min(page, count - 1);
  const ref = useRef<HTMLDivElement>(null), mounted = useRef(false), fromScroll = useRef(false), settle = useRef<number | undefined>(undefined);
  const step = () => (ref.current ? ref.current.clientWidth + GAP : 1);
  // 페이지가 바뀌면(점, 버튼, 주소) 그 페이지로 옮긴다. 처음(상세에서 돌아옴)은 바로, 그 뒤는 부드럽게. 손으로 넘겨 바뀐 경우는 이미 그 자리다
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    if (fromScroll.current) { fromScroll.current = false; return; }
    const left = cur * step();
    if (Math.abs(el.scrollLeft - left) > 2) el.scrollTo({ left, behavior: mounted.current ? 'smooth' : 'auto' });
    mounted.current = true;
  }, [cur, count]);
  // 손으로 넘기면 멈춘 자리의 페이지를 알린다
  const onScroll = () => {
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => { const el = ref.current; if (!el) return; const i = Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / step()))); if (i !== cur) { fromScroll.current = true; onPage(i); } }, 120);
  };
  const go = (i: number) => { if (i >= 0 && i < count && i !== cur) onPage(i); };
  return <div className="space-y-4">
    <div ref={ref} data-testid="home-products" onScroll={onScroll} style={{ gap: GAP, scrollbarWidth: 'none' }} className="flex snap-x snap-mandatory items-start overflow-x-auto overscroll-x-contain">
      {pages.map((list, i) => <section key={i} aria-roledescription="페이지" aria-label={`상품 ${count}페이지 중 ${i + 1}페이지`} data-current={i === cur ? 'true' : undefined} inert={i !== cur} className="grid w-full shrink-0 snap-start grid-cols-2 gap-x-3 gap-y-6">{list.map(render)}</section>)}
    </div>
    {count > 1 && <nav aria-label="상품 페이지" className="flex items-center justify-center gap-1">
      <button type="button" aria-label="이전 페이지" disabled={cur === 0} onClick={() => go(cur - 1)} className="grid h-8 w-8 place-items-center text-[var(--aux)] disabled:opacity-30"><ChevronLeft size={18}/></button>
      {pageDots(cur, count).map(d => <button key={d.page} type="button" aria-label={`${d.page + 1}페이지`} aria-current={d.page === cur ? 'page' : undefined} onClick={() => go(d.page)} className="grid h-8 w-6 place-items-center"><span className={`block rounded-full ${d.small ? 'h-1.5 w-1.5' : 'h-2 w-2'} ${d.page === cur ? 'bg-[var(--ink)]' : 'bg-[var(--line)]'}`}/></button>)}
      <button type="button" aria-label="다음 페이지" disabled={cur === count - 1} onClick={() => go(cur + 1)} className="grid h-8 w-8 place-items-center text-[var(--aux)] disabled:opacity-30"><ChevronRight size={18}/></button>
      <span role="status" className="sr-only">{`${count}페이지 중 ${cur + 1}페이지`}</span>
    </nav>}
  </div>;
}
