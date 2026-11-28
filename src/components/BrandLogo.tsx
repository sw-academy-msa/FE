import { LOGO_PATH, LOGO_VIEWBOX } from '../splashLogo';

/** STOCKDROP 글자 로고(Pencil 시안 Logo). 글자색은 color(기본: 부모 글자색)를 따른다. 읽기용 이름은 감싸는 쪽에서 붙인다 */
export function BrandLogo({ width, color = 'currentColor', className = '' }: { width: number; color?: string; className?: string }) {
  const [vx, vy, vw, vh] = LOGO_VIEWBOX;
  return <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} width={width} height={Math.round(width * vh / vw)} aria-hidden="true" focusable="false" className={`block ${className}`}>
    <path d={LOGO_PATH} fill={color}/>
  </svg>;
}
