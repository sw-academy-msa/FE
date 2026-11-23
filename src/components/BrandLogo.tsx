import { useId } from 'react';
import { LOGO_DOT, LOGO_DROP, LOGO_STOCK, LOGO_VIEWBOX } from '../splashLogo';

/**
 * STOCKDROP 로고(STOCK / DROP 2단 + 오른쪽 위 빨간 점). 글자색은 color(기본: 부모 글자색)를 따른다.
 * 빨간 점 뒤에 번진 빛을 고정으로 그린다(무한 반복 애니메이션은 Astryx Drawer의 닫힘을 막아 쓰지 않는다). 읽기용 이름은 감싸는 쪽에서 붙인다
 */
export function BrandLogo({ width, color = 'currentColor', className = '' }: { width: number; color?: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  const [vx, vy, vw, vh] = LOGO_VIEWBOX;
  const [cx, cy, r] = LOGO_DOT;
  return <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} width={width} height={Math.round(width * vh / vw)} aria-hidden="true" focusable="false" className={`block overflow-visible ${className}`}>
    <defs>
      <radialGradient id={`${id}-dot`} cx="40%" cy="36%" r="68%"><stop offset="0" stopColor="#FF7A7A"/><stop offset=".5" stopColor="#FF2B2B"/><stop offset="1" stopColor="#D1001F"/></radialGradient>
      <filter id={`${id}-blur`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation={r * .9}/></filter>
      {/* K 오른쪽 위 팔 끝이 점 쪽으로 갈수록 붉게 물드는 꼬리(첨부 로고) */}
      <linearGradient id={`${id}-tail`} gradientUnits="userSpaceOnUse" x1={cx - r} y1={cy + r * .4} x2={cx - r * 3} y2={cy + r * 3.6}><stop offset="0" stopColor="#FF2B2B" stopOpacity=".75"/><stop offset="1" stopColor="#FF2B2B" stopOpacity="0"/></linearGradient>
      <clipPath id={`${id}-stock`}><path d={LOGO_STOCK}/></clipPath>
    </defs>
    <path d={`${LOGO_STOCK}${LOGO_DROP}`} fill={color} fillRule="evenodd"/>
    <rect x={cx - r * 4} y={cy} width={r * 4} height={r * 4} fill={`url(#${id}-tail)`} clipPath={`url(#${id}-stock)`}/>
    <circle cx={cx} cy={cy} r={r * 1.9} fill="#FF2B2B" filter={`url(#${id}-blur)`} className="logo-halo"/>
    <circle cx={cx} cy={cy} r={r} fill={`url(#${id}-dot)`}/>
    <ellipse cx={cx - r * .3} cy={cy - r * .38} rx={r * .34} ry={r * .2} fill="#FFFFFF" opacity=".45"/>
  </svg>;
}
