# STOCKDROP 리디자인 지침서

목표는 화면의 **모습**만 바꾸는 것이다. 서버 통신, 데이터 흐름, 화면 이동, 결제와 알림 동작은 지금 그대로 둔다.

## 1. 한 줄 원칙

> 바꿔도 되는 것: 색, 글자, 간격, 모서리, 그림자, 아이콘, 배치, 컴포넌트 모양.
> 바꾸면 안 되는 것: API 호출, 요청과 응답 데이터, 상태 관리, 라우트와 쿼리 파라미터, 결제와 푸시 흐름, 이벤트 전송.

판단이 어려우면 "이 변경이 서버로 가는 요청이나 받은 값을 다루는 방식을 바꾸는가?"를 묻는다. 바꾼다면 하지 않는다.

## 2. 기술 구성 (그대로 유지)

- React 19, Vite 6, Tailwind CSS 4, react-router 7 **HashRouter**(주소가 `/#/...` 형태), 디자인 시스템 Astryx.
- 배포: Vercel. 기능 플래그는 Vercel 빌드 환경 변수(`VITE_FEATURE_*`).
- 새 UI 라이브러리, 새 상태 관리 라이브러리, 새 라우터를 넣지 않는다. 아이콘 라이브러리도 지금 쓰는 것을 쓴다.

## 3. 바꿔도 되는 곳

| 위치 | 내용 | 비고 |
|---|---|---|
| `src/theme/stockdrop.ts` | **디자인 토큰의 단일 출처.** 색(`stockdropPalette`), 글자 크기(`stockdropType`), 모서리(`stockdropRadius`), 움직임 | 여기 값을 바꾸면 Astryx 부품, Tailwind 클래스, 예전 CSS 변수까지 한 번에 바뀐다. 가장 먼저 여기서 시작한다. |
| `src/styles.css` | 전역 스타일, Tailwind `@theme` 매핑(`--color-ink` 등) | 토큰 이름(`ink`, `muted`, `soft`, `line`, `red`, `green` ...)은 유지하고 값만 바꾼다. 이름을 바꾸면 모든 화면의 클래스를 같이 바꿔야 한다. |
| `src/components/ui.tsx` | 공통 부품: Button, Field, Note, Badge, InfoRow, MenuRow, Chip, Toggle, Modal, BottomSheet, Header, BottomNav, ProductCard, ProductImage, Empty, Spinner, Toast 등 | **마크업과 클래스만** 바꾼다. 함수 이름, props 이름과 타입, 콜백(onClick, onChange, onClose 등) 호출 시점은 유지한다. |
| `src/components/*.tsx` | 화면 조각(HomePager, PhotoViewer, Splash, BrandLogo, SellerMonthlySales, AdvertisingBadge 등) | 모양만. 안에서 부르는 API나 훅은 그대로. |
| `src/pages/*.tsx` | 화면 | JSX 구조, 클래스, 문구 배치, 컴포넌트 배치만. 아래 4절의 코드는 손대지 않는다. |
| 이미지, 로고, 아이콘, 폰트 | `public/`, BrandLogo, splash | 파일 교체 가능. 파일 이름이나 경로를 바꾸면 참조하는 곳도 같이 바꾼다. |

## 4. 바꾸면 안 되는 곳

### 4-1. 통신 계층: 수정 금지
- `src/api/**` 전체: 서버 주소, 경로, 요청 본문, 응답 변환, 오류 코드 처리, 재시도.
- `src/config.ts`, `src/features.ts`(기능 플래그), `src/store.ts`(상태와 저장소 키), `src/hooks.ts`(useApi, useLive 등 데이터 훅), `src/auth.ts`.
- 결제와 귀환: `src/membershipBilling.ts`, `src/pages/tossReturn.tsx`, `src/pages/advertisingPayment.tsx`의 로직, 토스 SDK 호출 순서, sessionStorage 키.
- 푸시와 알림: `src/push.ts`, `src/pushStatus.ts`, 서비스 워커(`sw`), 알림 딥링크 매핑(`src/api/notifications.ts`).
- 이벤트 전송: `src/analytics.ts`(GA), `src/behavior.ts`(AI 행동 이벤트)와 화면에서 이 함수를 부르는 위치와 시점.
- 도메인 계산: `src/domain.ts`, `src/dates.ts`, `src/sellerMetrics.ts`, `src/optionModel*`, `src/categoryTree.ts` 등 계산 로직.

### 4-2. 화면 안에서도 유지할 것
- `useApi`, `useLive`, `useStore`, `useMembership` 같은 훅 호출과 그 인자.
- 버튼의 동작 함수(`onClick={buy}` 등)와 비활성 조건(`disabled={...}`), 로딩과 오류 분기(`LiveStatus`, `ErrorBox`, `RetryError`).
- 폼 검증 규칙과 오류 문구 연결(필드 오류 표시 위치는 바꿔도 되지만, 어느 오류가 어느 칸에 붙는지는 유지).
- 라우트 경로와 쿼리 파라미터: `/my?membership=manage|join`, `/my?coupons=available|used|expired`, `/my?claim=CODE`, `/product/:id?campaign=CODE`, `#/membership/billing/success|fail`, `#/seller/advertising/toss/success|fail`, `#/payments/toss/success|fail`. 알림, 결제사, 공유 링크가 이 주소로 들어온다.
- 화면 사이 이동 흐름(어느 버튼이 어디로 가는지), 뒤로 가기 처리(`useCloseOnBack`, `useLeaveGuard`).
- 기능 플래그 분기(`MEMBERSHIP_COUPON`, 광고 플래그 등): 꺼졌을 때 안 보이던 것은 계속 안 보여야 한다.
- 접근성 속성: `role`, `aria-*`, `alt`, `data-testid`. E2E 테스트가 이 값과 일부 문구로 요소를 찾는다.

### 4-3. 문구
- 결제 금액, 수수료, 약관, 동의 문구, 광고 표시("(광고)"), 오류 안내는 법적 또는 정책 의미가 있으니 바꾸지 않는다. 바꿔야 하면 기획 확인 후.
- 일반 안내 문구 톤은 바꿔도 되지만, 테스트가 문구로 찾는 경우가 있어 아래 6절 테스트로 확인한다.

## 5. 디자인 규칙 (현재 기준, 리디자인 때 다시 정할 수 있음)

- 모바일 우선, 기준 폭 390~402px. 데스크톱은 가운데 모바일 폭 카드.
- 밝은 화면 하나만 쓴다(다크 모드 없음).
- 구매 버튼과 경고는 `red`, 성공과 진행 중은 `green`/`positive`, 기본 버튼은 `ink`(검정).
- 시트와 대화상자는 `BottomSheet`/`Modal` 하나로 통일, 시트 위에 시트를 겹치지 않는다.
- 새 색이 필요하면 `stockdrop.ts`에 토큰으로 추가하고 화면에 hex 값을 직접 쓰지 않는다.

## 6. 작업 방법과 확인

1. `develop`에서 브랜치를 만든다. `main`, `develop`에 직접 push하지 않는다.
2. 토큰(`stockdrop.ts`) → 공통 부품(`ui.tsx`) → 화면 순서로 바꾼다.
3. 매번 아래가 모두 통과해야 한다.
   - `npm run build` (eslint, TypeScript, vite build)
   - `npm test` (vitest)
   - `npm run test:e2e` (Playwright). 실패하면 디자인 변경이 동작을 건드렸는지 먼저 의심한다. 테스트 수정은 "문구나 선택자만 바뀐 경우"에만 하고, 그 이유를 PR에 적는다.
4. 변경 전후 화면을 402px 폭으로 캡처해 PR에 붙인다.
5. PR 설명에 "통신, 상태, 라우트 변경 없음"을 확인한 근거(변경 파일 목록)를 적는다. `src/api/**` 등 4-1 파일이 diff에 있으면 리뷰에서 반려한다.

## 7. 금지 사항

- 이 레포는 공개(PUBLIC)다. `.env.local`, `docs/registration-metadata.json`은 커밋하지 않는다.
- 실제 결제, 운영 계정 로그인 테스트는 하지 않는다. 결제는 토스 테스트 키 환경만 쓴다.
- 커밋 메시지와 PR 본문에 자동 생성 서명줄을 넣지 않는다.

## 8. 화면 목록 (참고)

| 파일 | 화면 |
|---|---|
| `pages/buyer.tsx` | 홈, 상품 상세, 옵션 선택, 주문/결제, 주문 목록과 상세, 알림함 |
| `pages/membershipCoupon.tsx` | 멤버십 카드와 가입/관리/해지, 내 쿠폰, 상품 혜택, 쿠폰 선택 |
| `pages/claimCampaign.tsx` | 쿠폰 받기 시트 |
| `pages/account.tsx` | 마이페이지(구매자, 운영자), 판매 심사 |
| `pages/adminCoupon.tsx` | 운영자 쿠폰 관리 |
| `pages/seller*.tsx`, `pages/wizard.tsx` | 판매자 화면, 판매 등록(AI 분석, 광고 토글) |
| `pages/auth.tsx` | 로그인, 회원가입, 알림 설정(동의 스위치) |
| `pages/address.tsx`, `pages/revisions.tsx`, `pages/*Correction.tsx` | 배송지, 수정 심사, 보완 요청 |
| `pages/tossReturn.tsx`, `pages/advertisingPayment.tsx`, `pages/checkoutExpired.tsx` | 결제 귀환과 결과 |
