import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

/**
 * STOCKDROP 디자인 토큰. 화면의 색, 글자 크기, 모서리, 움직임 값은 이 파일 한 곳에서만 정한다.
 *
 * 어떻게 퍼지는가
 * - stockdropPalette, stockdropType, stockdropRadius는 Astryx 테마의 localTokens(--sd-color-*, --sd-text-*, --sd-radius-*)로 html에 실린다.
 * - Astryx 부품은 아래 stockdropTokens(--color-text-primary 같은 Astryx 토큰)로 같은 값을 쓴다.
 * - Tailwind 클래스(text-ink, bg-soft, text-body, rounded-inner 등)는 styles.css의 @theme에서 이 변수들을 가리킨다.
 * - 예전 CSS 변수(--ink, --line 등)도 styles.css :root에서 이 변수들을 가리킨다.
 * 사용자 디자인을 입힐 때는 이 파일의 값만 바꾸면 Astryx 부품과 모든 화면에 함께 반영된다.
 * 밝은 화면만 쓰므로 [light, dark] 대신 한 값만 둔다.
 */
export const stockdropPalette = {
  // Pencil 시안(redeisn.pen) 테마 F 값. 시안에 없는 색은 예전 값을 그대로 둔다(표시: 시안 없음)
  // 글자와 기본
  ink: '#023EB5', // 주색(시안 ink·primary): 기본 버튼, 선택 상태, 막대, 밑줄 탭
  text: '#1B1D21', // 본문 글자(시안 text)
  muted: '#62666E', // 보조 글자(시안 text-meta)
  aux: '#62666E', // 브랜드명, 설명(시안 text-meta)
  meta: '#62666E', // 날짜, 부가 정보(시안 text-meta)
  placeholder: '#9A9EA5', // 시안 text-disabled
  surface: '#FFFFFF', // 화면, 카드, 시트 바탕(시안 card)
  bg: '#FFFFFF', // 시안 bg
  canvas: '#F0F2F4', // 화면 바깥 바탕, 구역 사이 띠(시안 surface)
  hero: '#EDF1F4', // 시안 없음
  overlay: '#14161999', // 시트, 대화상자 뒷배경(시안 dim)
  // 선과 면
  line: '#EAECEE', // 구분선(시안 divider)
  border: '#D6D9DD', // 테두리(시안 border)
  divider: '#EAECEE', // 시안 divider
  soft: '#F0F2F4', // 옅은 회색 면, 입력칸 바탕(시안 surface)
  'soft-btn': '#F0F2F4', // 회색 버튼(시안 Button tonal)
  infobar: '#FBFBFB', // 시안 없음
  blue: '#023EB5', // 시안 primary
  'blue-soft': '#F0F2F4', // 옅은 회색 면(예전 이름 그대로, 시안 surface)
  tint: '#E3EAF8E6', // 하단 메뉴 선택 칸(시안 tint)
  'tab-bar': '#FFFFFF8C', // 하단 메뉴 바탕(시안 Tab Bar)
  'tab-shadow': '#0B142729', // 하단 메뉴 그림자(시안 Tab Bar)
  'tab-glow': '#FFFFFF73', // 하단 메뉴 안쪽 빛(시안 Tab Bar)
  // 상태
  red: '#B9201A', // 오류(시안 error). 구매 버튼은 주색
  'red-soft': '#FFF2F0', // 시안 없음
  action: '#023EB5', // 구매 버튼(시안 buy)
  green: '#0B6E56', // 판매 중(시안 success)
  'green-soft': '#E0F2EC', // 완료 안내 상자(시안 주문 배송 상세 Notice)
  positive: '#0B6E56', // 시안 success
  'positive-soft': '#E0F2EC',
  urgent: '#D0261F', // 마감 임박(시안 urgent)
  'urgent-soft': '#FDEDED', // 시안 없음
  amber: '#8A7762', // 시안 없음
  'amber-soft': '#F7F5F2', // 시안 없음
  'sold-out': '#333333', // SOLD OUT 배지(어두운 배지 유지 결정)
  info: '#023EB5', // 운영자 입점 심사 배지(시안 info-fg)
  'info-soft': '#E6ECF8', // 시안 info-bg
  warning: '#7A4B00', // 운영자 판매 심사 배지(시안 warn-fg)
  'gauge-warning': '#E7B93F', // 중간 판매율 게이지, 글자에는 사용하지 않는다(시안 없음)
  'warning-soft': '#FBF0DC', // 시안 warn-bg
  // 안내 상자(판매 등록 AI 분석 상태). 글자·아이콘은 옅은 면 위에서 대비 4.5:1 이상
  'positive-strong': '#0B6E56', // 완료 상자 제목·아이콘(시안 success)
  caution: '#7A4B00', // 미완료 상자 제목·아이콘(시안 warn-fg)
  'caution-soft': '#FBF0DC', // 미완료 상자 면(시안 warn-bg)
  'aux-strong': '#464A51', // 옅은 면 위 본문(시안 text-2)
} as const;
export type PaletteName = keyof typeof stockdropPalette;

/** 글자 크기. 클래스 이름은 text-<이름>(예: text-body) */
export const stockdropType = {
  caption: '10px',
  footnote: '11px',
  label: '12px',
  body: '13px', // 본문 기본(body 글자 크기)
  callout: '14px',
  subhead: '15px',
  headline: '16px',
  'title-sm': '17px',
  title: '18px',
  'title-lg': '20px',
  heading: '22px',
  'heading-lg': '24px',
  'display-sm': '28px',
  display: '32px',
  'display-lg': '40px',
} as const;

/** 모서리. inner, element, container는 Astryx 토큰(--radius-*)이고 나머지는 STOCKDROP 값. 클래스 이름은 rounded-<이름> */
export const stockdropRadius = {
  badge: '8px', // 작은 상태 배지(시안 r-s)
  inner: '14px', // 사진, 안내 상자, 입력칸(시안 r-m)
  element: '14px', // 버튼(시안 r-m)
  card: '20px', // 카드, 큰 안내 상자(시안 r-l)
  dialog: '28px', // 가운데 대화상자(시안 r-xl, Popup)
  container: '28px', // 바텀 시트 위쪽(결정: 28)
  pill: '999px', // 알약 모양(시안 r-pill)
} as const;

const p = stockdropPalette;
/** Astryx 부품이 읽는 토큰. 값은 위 팔레트에서 가져온다 */
export const stockdropTokens = {
  // 글자
  '--color-text-primary': p.text,
  '--color-text-secondary': p.muted,
  '--color-text-disabled': p.placeholder,
  '--color-text-accent': p.ink,
  '--color-text-error': p.red,
  '--color-text-success': p.positive,
  // 바탕
  '--color-background-body': p.canvas,
  '--color-background-surface': p.surface,
  '--color-background-card': p.surface,
  '--color-background-popover': p.surface,
  '--color-background-muted': p.soft,
  '--color-overlay': p.overlay,
  // 주요 버튼(주색 파랑)과 그 위 글자
  '--color-accent': p.ink,
  '--color-accent-muted': p['soft-btn'],
  '--color-on-accent': p.surface,
  // 상태
  '--color-error': p.red,
  '--color-error-muted': p['red-soft'],
  '--color-on-error': p.surface,
  '--color-success': p.green,
  '--color-success-muted': p['green-soft'],
  // 선
  '--color-border': p.line,
  '--color-border-emphasized': p.border,
  // 모서리
  '--radius-inner': stockdropRadius.inner,
  '--radius-element': stockdropRadius.element,
  '--radius-container': stockdropRadius.container,
} as const;

/** STOCKDROP 전용 토큰(Astryx에 같은 이름이 없는 것). html의 --sd-* 변수가 된다 */
export const stockdropLocalTokens: Record<string, string> = {
  ...Object.fromEntries(Object.entries(stockdropPalette).map(([name, value]) => [`--sd-color-${name}`, value])),
  ...Object.fromEntries(Object.entries(stockdropType).map(([name, value]) => [`--sd-text-${name}`, value])),
  '--sd-radius-badge': stockdropRadius.badge,
  '--sd-radius-dialog': stockdropRadius.dialog,
  '--sd-radius-card': stockdropRadius.card,
  '--sd-radius-pill': stockdropRadius.pill,
};

/**
 * 움직임(모션) 토큰. Astryx 바텀 시트는 --duration-medium과 --ease-standard로 올라오고, --duration-exit와 --ease-exit로 내려간다.
 * 공통 부품(ui.tsx)과 styles.css도 같은 변수를 쓴다. 휴대폰에서 딱딱하지 않게 iOS 시트 느낌의 감속 곡선을 쓴다
 */
export const stockdropMotion = {
  '--duration-medium': '300ms', // 바텀 시트 올라오기, 뒷배경 어두워지기
  '--duration-exit': '240ms', // 바텀 시트 내려가기
  '--duration-fast': '200ms', // 가운데 대화상자 나타나기
  '--ease-standard': 'cubic-bezier(0.32, 0.72, 0, 1)', // iOS 시트 감속
  '--ease-entrance': 'cubic-bezier(0.32, 0.72, 0, 1)',
  '--ease-move': 'cubic-bezier(0.32, 0.72, 0, 1)',
  '--ease-exit': 'cubic-bezier(0.32, 0, 0.67, 0)', // 내려갈 때는 점점 빠르게
} as const;
/** 시트가 다 내려간 뒤 부모에게 닫혔다고 알리기까지(ms). --duration-exit와 같게 둔다 */
export const SHEET_EXIT_MS = 240;
/** 버튼 눌림: 100ms 동안 0.97배 */
export const stockdropPress = { scale: '0.97', duration: '100ms' } as const;

/** 버튼 높이와 글자 */
export const stockdropButton = { height: '48px', fontSize: stockdropType.body } as const;

/** 본문 글꼴. Astryx 부품과 화면 전체(body)가 같이 쓴다(--font-family-body) */
const font = { family: 'Noto Sans KR', fallbacks: 'sans-serif' };

export const stockdropTheme = defineTheme({
  name: 'stockdrop',
  extends: neutralTheme,
  typography: { body: font, heading: font },
  tokens: { ...stockdropTokens, ...stockdropMotion },
  localTokens: stockdropLocalTokens,
  components: {
    // 판매 등록 단계 진행 막대(Astryx ProgressBar): 얇은 4px 막대, 바탕은 선 색, 채움은 주색
    'progress-bar-track': { base: { height: '4px', backgroundColor: 'var(--sd-color-line)' } },
    'progress-bar-fill': { base: { backgroundColor: 'var(--sd-color-ink)' } },
    button: {
      base: { minHeight: stockdropButton.height, fontSize: stockdropButton.fontSize, fontWeight: '700', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', transitionProperty: 'transform, background-color, opacity', transitionDuration: stockdropPress.duration, transitionTimingFunction: 'ease-out' },
      ':active': { transform: `scale(${stockdropPress.scale})` },
      'variant:secondary': { backgroundColor: 'var(--color-background-surface)', color: 'var(--color-text-primary)', boxShadow: 'inset 0 0 0 1px var(--color-border-emphasized)' },
      'variant:buy': { backgroundColor: 'var(--sd-color-action)', color: 'var(--color-on-accent)' },
    },
  },
});

declare module '@astryxdesign/core/Button' {
  interface ButtonVariantMap { buy: true }
}
