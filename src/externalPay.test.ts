import { describe, expect, it } from 'vitest';
import { externalBrowserUrl, payStartHash, payStartUrl, PAY_START_PARAM } from './externalPay';

const IOS17 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IOS16 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

describe('토스 결제를 시스템 브라우저로', () => {
  const url = payStartUrl('https://stockdrop.example', '/', 'o-1');
  it('브라우저 시작 주소는 해시 없이 쿼리로 주문을 넘긴다(안드로이드 intent 주소에 #을 쓸 수 없어서)', () => {
    expect(url).toBe(`https://stockdrop.example/?${PAY_START_PARAM}=o-1`);
  });
  it('아이폰 iOS 17 이상은 Safari 앱을 여는 x-safari 주소, 그보다 낮으면 그대로(새 창)', () => {
    expect(externalBrowserUrl(url, IOS17)).toBe(`x-safari-${url}`);
    expect(externalBrowserUrl(url, IOS16)).toBe(url);
  });
  it('안드로이드는 Chrome으로 여는 intent 주소(Chrome이 없으면 기본 브라우저)', () => {
    expect(externalBrowserUrl(url, ANDROID)).toBe(`intent://stockdrop.example/?${PAY_START_PARAM}=o-1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`);
  });
  it('그 밖(데스크톱)은 그대로', () => { expect(externalBrowserUrl(url, DESKTOP)).toBe(url); });
  it('브라우저에서 시작 주소로 열리면 결제 시작 화면 해시로 바꾼다', () => {
    expect(payStartHash(`?${PAY_START_PARAM}=o-1`)).toBe('#/payments/toss/start?order=o-1');
    expect(payStartHash('?paymentKey=x')).toBeNull();
    expect(payStartHash('')).toBeNull();
  });
});
