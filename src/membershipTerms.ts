/**
 * 멤버십 정기결제 약관 본문(FE 고정 문구). 서버 configuration의 termsVersion과 같은 버전의 본문만 보여 주고 동의를 받는다.
 * 서버 버전이 바뀌면 여기에 새 버전 본문을 추가한다. 맞는 본문이 없으면 가입 동의를 받지 않는다.
 */
export interface MembershipTerms { version: string; title: string; body: string }
export const MEMBERSHIP_TERMS: Record<string, MembershipTerms> = {
  'recurring-v1': {
    version: 'recurring-v1',
    title: 'STOCKDROP 멤버십 이용약관 및 정기결제 동의',
    body: [
      '1. 멤버십은 월 단위 유료 서비스이며, 이용료는 가입할 때 안내한 금액으로 등록한 카드에서 매달 같은 날 자동 결제됩니다.',
      '2. 첫 이용료는 카드를 등록하면 바로 결제되고, 결제가 승인된 뒤부터 혜택이 적용됩니다.',
      '3. 혜택: 멤버십 이용 기간 동안 STOCKDROP에서 주문하는 상품의 배송비가 무료이며, 매달 회원 전용 쿠폰이 지급됩니다. 쿠폰별 사용 조건과 유효기간은 쿠폰에 표시된 내용을 따릅니다.',
      '4. 정기결제에 실패하면 3일 동안 혜택을 유지하며 결제를 다시 시도합니다. 그 기간에도 결제되지 않으면 멤버십이 종료됩니다.',
      '5. 해지는 마이페이지의 멤버십 관리에서 언제든 할 수 있습니다. 해지하면 다음 정기결제가 진행되지 않고, 이미 결제한 이용 기간이 끝날 때까지 혜택을 이용할 수 있습니다. 이미 결제한 이용료는 환불되지 않습니다.',
      '6. 이용료나 혜택이 바뀌는 경우 적용 전에 알려 드리며, 바뀐 조건에 동의하지 않으면 해지할 수 있습니다.',
      '7. 카드 정보는 결제대행사(토스페이먼츠)가 보관하며 STOCKDROP은 카드번호를 저장하지 않습니다.',
    ].join('\n'),
  },
};
export const membershipTermsFor = (version: string | undefined | null) => (version ? MEMBERSHIP_TERMS[version] : undefined);
