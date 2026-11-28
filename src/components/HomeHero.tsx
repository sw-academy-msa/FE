import { useEffect, useRef, useState } from 'react';
import { Link, useViewTransitionState } from 'react-router-dom';
import { Pause, Play } from 'lucide-react';
import type { Product } from '../domain';
import { money, stockTotal } from '../domain';
import { clockLeft, ProductImage, RollingText } from './ui';

const CARD = 336, GAP = 10, AUTO_MS = 4000;
/**
 * 홈 상단 상품 슬라이드(시안 최종 색 · 홈 Hero Carousel, 사용자 요청으로 카드를 가운데 정렬): 판매 중 상품 카드(부모가 마감 임박 먼저, 최대 5개로 고른다).
 * 4초마다 다음 카드로 넘기고(마지막 다음은 처음), 정지/재생 버튼으로 멈춘다. 움직임 줄이기 설정이면 멈춘 채 시작한다
 */
export function HomeHero({ products, now, left }: { products: Product[]; now: number; left: (p: Product) => number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const count = products.length;
  useEffect(() => {
    if (!playing || count < 2) return;
    const timer = setInterval(() => {
      const el = ref.current; if (!el) return;
      const next = (Math.round(el.scrollLeft / (CARD + GAP)) + 1) % count;
      el.scrollTo({ left: next * (CARD + GAP), behavior: 'smooth' });
    }, AUTO_MS);
    return () => clearInterval(timer);
  }, [playing, count]);
  if (!count) return null;
  return <section aria-label="지금 판매 중인 상품" className="relative -mx-4">
    <div ref={ref} style={{ scrollbarWidth: 'none' }} className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-[calc((100%-336px)/2)] pt-4">
      {products.map((p, i) => {
        return <HeroCard key={p.id} product={p} index={i} count={count} now={now} left={left}/>;
      })}
    </div>
    {count > 1 && <button type="button" aria-label={playing ? '슬라이드 정지' : '슬라이드 재생'} onClick={() => setPlaying(v => !v)} className="press absolute left-[calc(50%+122px)] top-[30px] grid h-8 w-8 place-items-center rounded-full bg-overlay text-surface">{playing ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>}</button>}
  </section>;
}

/** 슬라이드 카드 한 장. 확대 전환으로 상세 큰 사진에 이어진다 */
function HeroCard({ product: p, index: i, count, now, left }: { product: Product; index: number; count: number; now: number; left: (p: Product) => number }) {
  const zooming = useViewTransitionState(`/product/${p.id}`);
  const urgent = p.endsAt - now <= 3_600_000, l = left(p), total = stockTotal(p);
  return <Link to={`/product/${p.id}`} viewTransition className="w-[336px] shrink-0 snap-center overflow-hidden rounded-card border border-border bg-surface">
          <div className="relative h-[308px]" style={{ viewTransitionName: zooming ? 'product-photo' : undefined }}>
            <ProductImage src={p.images[0]} alt={p.name} className="absolute! inset-0 h-full w-full rounded-none!"/>
            <span className={`absolute left-3.5 top-3.5 flex items-center gap-1.5 rounded-pill bg-surface px-3 py-2 text-body font-bold ${urgent ? 'text-urgent' : 'text-green'}`}><span className="h-[7px] w-[7px] rounded-full bg-current"/>{urgent ? '마감 임박' : '판매 중'}</span>
            <span className="absolute bottom-3.5 right-3.5 rounded-pill bg-overlay px-[11px] py-1.5 text-label font-semibold text-surface">{i + 1} / {count}</span>
          </div>
          <div className="space-y-4 px-4.5 pb-5 pt-4.5">
            <div className="space-y-2"><p className="text-[26px] font-black tracking-[-.6px]">{money(p.price)}</p><p className="text-subhead font-medium tracking-[-.4px] text-muted">{p.name}</p></div>
            <div className="flex items-center justify-between text-body font-medium text-muted">
              <p className="flex items-center gap-[7px]">마감까지<span className={`text-title-sm font-bold tabular-nums ${urgent ? 'text-urgent' : 'text-text'}`}><RollingText text={clockLeft(p.endsAt - now)}/></span></p>
              <p className="flex items-center gap-[7px]">남은 수량<span className="text-title-sm font-bold text-text"><RollingText text={`${l}개`}/></span></p>
            </div>
            <div className="h-1 w-full rounded-[2px] bg-line"><div className={`h-1 rounded-[2px] ${urgent ? 'bg-urgent' : 'bg-ink'}`} style={{ width: `${total ? Math.min(100, (1 - l / total) * 100) : 0}%` }}/></div>
          </div>
        </Link>;
}
