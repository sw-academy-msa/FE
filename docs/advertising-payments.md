# 판매 등록 광고 테스트 결제

`VITE_FEATURE_ADVERTISING=true`를 명시한 실제 API 모드에서 신규 신청 UI와 운영자 배지를 표시한다. 기본값은 false다. FE 플래그는 Vercel 빌드 환경 변수이며 SSM을 사용하지 않는다. 서버의 quote capability 및 확정 금액을 다시 확인한 뒤 결제를 준비한다.

판매 등록 마지막 단계에서 기본 OFF인 동의 토글과 예상 광고비를 표시한다. 광고비는 판매가와 최초 수량 합계의 5%이며 최소 1,000원 미만은 신청할 수 없다. 서버 저장 뒤 quote 및 advertising-submissions를 사용하며 광고 OFF는 기존 review-submissions를 유지한다. 승인 상품의 수정 심사에는 광고 토글과 재결제가 없다.

광고 결제 준비는 `/seller/advertising/checkout/{productId}/{applicationId}`, 귀환은 `/seller/advertising/toss/success|fail` 전용 경로다. 구매 주문 SD 파서와 저장소를 사용하지 않는다. 공개 test_ck 키는 결제창, test_gck 키는 위젯의 결제 수단과 약관을 표시한다. 금액은 서버 checkout 원본만 사용한다.

귀환의 해시 앞뒤 쿼리는 라우터 및 분석 초기화 전에 즉시 제거하며 동일 문서의 해시 이동도 처리한다. sessionStorage 키는 stockdrop:advertising 전용이다. AD 주문번호가 있으면 저장소 없이 Payment 원본에서 상품 및 회차를 복구한다. paymentId UUID를 completion 멱등 키로 사용하므로 다른 탭과 재로그인 및 재시도에서도 같은 키다. 공급자 결제키를 로그와 분석 이벤트 또는 재로그인 주소에 넣지 않는다.

202는 승인 접수이며 PAID와 Product SUBMITTED를 구분한다. 금융 또는 투영 지연은 3분 동안 확인한 뒤 실패로 확정하지 않고 재확인 안내를 제공한다. 실패 귀환 및 결제창 닫기는 서버 중단 의도와 금융 상태를 확인한다. 판매자 상품 목록의 미확정 신청도 서버 회차로 복구한다. FE 신규 노출을 꺼도 기존 귀환 복구 경로는 금융 drain까지 유지한다.

관리자 목록과 상세는 Product 응답의 광고 투영을 사용하며 상품마다 Payment를 조회하지 않는다. 상세에는 회차, 원본 광고비, 결제 및 취소 시각과 운영 준비 상태를 표시한다. APPROVED 및 PAID이면 상품 전용 5% 받기 쿠폰을 운영자가 수동 생성하라는 안내를 제공한다. 쿠폰 생성과 SNS 게시를 자동화하지 않는다.

배포는 Payment V5, Product V6 및 전용 토픽과 ACL을 먼저 준비하고 Gateway와 FE는 숨김 상태로 배포한다. 양쪽 consumer와 Payment processing 및 기존 Outbox를 준비한 뒤 Payment 신규 접수, Product 신규 접수, FE 순으로 켠다. main 배포와 실제 SSM 변경은 이번 작업에서 수행하지 않는다.

검증은 npm run build의 eslint, TypeScript 및 Vite와 npm test 전체를 사용한다. 새 E2E는 STOCKDROP_REAL_TEST=true 및 VITE_FEATURE_ADVERTISING=true인 로컬 실제 API 모드에서 tests/advertising-live.spec.ts를 실행한다. 외부 요청은 차단하고 토스 SDK와 HTTP를 합성 fixture로 대체한다. CI도 같은 검사를 수행한다. 실제 토스 테스트 거래 및 운영 API는 호출하지 않는다.

카테고리 단위 테스트는 서버에서 저장한 응답 파일 대신 V2 및 V3 SQL의 고정 공개 분류만 추출한 tests/fixtures/registration-categories.json을 사용한다. docs/registration-metadata.json과 .env.local은 계속 ignore하며 커밋하지 않는다. adminCoupon.tsx와 membershipCoupon.tsx는 변경하지 않는다.
