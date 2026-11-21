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
  // 글자와 기본
  ink: '#222222', // 본문 글자, 검정 버튼
  muted: '#858585', // 보조 글자
  aux: '#7B7B7B', // 브랜드명, 설명
  meta: '#949494', // 날짜, 부가 정보
  placeholder: '#A0A0A0',
  surface: '#FFFFFF', // 화면, 카드, 시트 바탕
  bg: '#FFFFFF',
  canvas: '#F4F5F6', // 화면 바깥 바탕
  hero: '#EDF1F4',
  overlay: '#00000066', // 시트, 대화상자 뒷배경
  // 선과 면
  line: '#EEEEEE', // 구분선, 입력칸 밑줄
  border: '#DEDEDE', // 테두리
  divider: '#F2F2F2',
  soft: '#F5F5F5', // 옅은 회색 면
  'soft-btn': '#EEEEEE',
  infobar: '#FBFBFB',
  blue: '#222222',
  'blue-soft': '#F5F5F5',
  // 상태
  red: '#EF6253', // 오류, 구매 버튼
  'red-soft': '#FFF2F0',
  action: '#EF6253',
  green: '#37AE7C', // 포커스 테두리, 판매 중
  'green-soft': '#EEF8F3',
  positive: '#3FB181',
  'positive-soft': '#EEF8F3',
  urgent: '#E5484D', // 마감 임박
  'urgent-soft': '#FDEDED',
  amber: '#8A7762',
  'amber-soft': '#F7F5F2',
  'sold-out': '#333333', // SOLD OUT 배지
  info: '#2F6FED', // 운영자 입점 심사 배지
  'info-soft': '#EAF1FF',
  warning: '#D9730D', // 운영자 판매 심사 배지
  'warning-soft': '#FFF1E5',
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
  badge: '3px', // 작은 상태 배지
  inner: '4px', // 사진, 안내 상자, 입력 상자
  element: '6px', // 버튼
  dialog: '8px', // 가운데 대화상자
  container: '16px', // 바텀 시트 위쪽
} as const;

const p = stockdropPalette;
/** Astryx 부품이 읽는 토큰. 값은 위 팔레트에서 가져온다 */
export const stockdropTokens = {
  // 글자
  '--color-text-primary': p.ink,
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
  // 주요 버튼(검정)과 그 위 글자
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
    // 판매 등록 단계 진행 막대(Astryx ProgressBar): 얇은 4px 막대, 바탕은 선 색, 채움은 본문 색
    'progress-bar-track': { base: { height: '4px', backgroundColor: 'var(--sd-color-line)' } },
    'progress-bar-fill': { base: { backgroundColor: 'var(--sd-color-ink)' } },
    button: {
      base: { minHeight: stockdropButton.height, fontSize: stockdropButton.fontSize, fontWeight: '700', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', transitionProperty: 'transform, background-color, opacity', transitionDuration: stockdropPress.duration, transitionTimingFunction: 'ease-out' },
      ':active': { transform: `scale(${stockdropPress.scale})` },
      'variant:secondary': { backgroundColor: 'var(--color-background-surface)', color: 'var(--color-text-primary)', boxShadow: 'inset 0 0 0 1px var(--color-border)' },
      'variant:buy': { backgroundColor: 'var(--sd-color-red)', color: 'var(--color-on-error)' },
    },
  },
});

declare module '@astryxdesign/core/Button' {
  interface ButtonVariantMap { buy: true }
}
