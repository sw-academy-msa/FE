import { USE_MOCK } from './config';
/**
 * 회원제와 쿠폰 화면(마이페이지 멤버십 카드, 내 쿠폰, 상품 상세 혜택 행, 옵션 시트 쿠폰 선택, 행동 이벤트)을 켜는 FE 플래그.
 * 기본은 꺼짐. 운영에서 켜려면 Vercel 환경 변수 VITE_FEATURE_MEMBERSHIP_COUPON=true를 넣고 다시 배포한다(빌드 때 고정되는 값).
 * mock 모드는 서버가 없어 켜지 않는다.
 */
export const MEMBERSHIP_COUPON = !USE_MOCK && import.meta.env.VITE_FEATURE_MEMBERSHIP_COUPON === 'true';
/**
 * 백엔드 수정이 끝나면 연결할 자리(계약 전달 전에는 숨김). 계약이 오면 값만 true로 바꾸고 연결 코드를 넣는다.
 * - resumeCancel: 해지 예약 취소(해지 취소하기 버튼)
 * - cardReRegister: 결제 실패 유예 중 카드 다시 등록
 * - billingAuth: 카드 등록 시작과 귀환 처리(15-1 완료, 15-2 실패 결과 시트)
 */
export const PENDING_CONTRACTS = { resumeCancel: false, cardReRegister: false, billingAuth: false } as const;
