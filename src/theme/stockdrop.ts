import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

/**
 * STOCKDROP Astryx 테마 (1단계 시험 도입).
 * 지금 화면(styles.css :root 변수)과 같은 값으로 시작한다. 사용자 디자인 샘플이 오면 아래 tokens 값만 바꾸면 된다.
 * 주석은 같은 값을 쓰는 기존 CSS 변수 이름이다. 밝은 화면만 쓰므로 [light, dark] 대신 한 값만 둔다.
 */
export const stockdropTokens = {
  // 글자
  '--color-text-primary': '#222222', // --ink
  '--color-text-secondary': '#858585', // --muted
  '--color-text-disabled': '#A0A0A0', // --placeholder
  '--color-text-accent': '#222222', // --ink
  '--color-text-error': '#EF6253', // --red
  '--color-text-success': '#3FB181', // --positive
  // 바탕
  '--color-background-body': '#F4F5F6', // --canvas
  '--color-background-surface': '#FFFFFF', // --surface
  '--color-background-card': '#FFFFFF', // --surface
  '--color-background-popover': '#FFFFFF', // --surface
  '--color-background-muted': '#F5F5F5', // --soft
  '--color-overlay': '#00000066', // --overlay
  // 주요 버튼(검정)과 그 위 글자
  '--color-accent': '#222222', // --ink
  '--color-accent-muted': '#EEEEEE', // --soft-btn
  '--color-on-accent': '#FFFFFF', // --surface
  // 상태
  '--color-error': '#EF6253', // --red
  '--color-error-muted': '#FFF2F0', // --red-soft
  '--color-on-error': '#FFFFFF',
  '--color-success': '#37AE7C', // --green
  '--color-success-muted': '#EEF8F3', // --green-soft
  // 선
  '--color-border': '#EEEEEE', // --line
  '--color-border-emphasized': '#DEDEDE', // --border
  // 모서리: 버튼 6px, 사진과 안내 상자 4px, 바텀 시트 위쪽 16px
  '--radius-inner': '4px',
  '--radius-element': '6px',
  '--radius-container': '16px',
} as const;

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

/** 구매 버튼(빨강)처럼 테마에만 있는 값 */
export const stockdropButton = { height: '48px', fontSize: '13px', buyBackground: '#EF6253' /* --red */ } as const;

const font = { family: 'Noto Sans KR', fallbacks: 'sans-serif' };

export const stockdropTheme = defineTheme({
  name: 'stockdrop',
  extends: neutralTheme,
  typography: { body: font, heading: font },
  tokens: { ...stockdropTokens, ...stockdropMotion },
  components: {
    button: {
      base: { minHeight: stockdropButton.height, fontSize: stockdropButton.fontSize, fontWeight: '700', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', transitionProperty: 'transform, background-color, opacity', transitionDuration: stockdropPress.duration, transitionTimingFunction: 'ease-out' },
      ':active': { transform: `scale(${stockdropPress.scale})` },      'variant:secondary': { backgroundColor: 'var(--color-background-surface)', color: 'var(--color-text-primary)', boxShadow: 'inset 0 0 0 1px var(--color-border)' },
      'variant:buy': { backgroundColor: stockdropButton.buyBackground, color: '#FFFFFF' },
    },
  },
});

declare module '@astryxdesign/core/Button' {
  interface ButtonVariantMap { buy: true }
}
