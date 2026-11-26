import { ADVERTISING } from '../features';
import { advertisingLabel } from '../api/advertising';
import type { AdvertisingSummary } from '../api/advertising';
import { money } from '../domain';
/** 관리 화면은 상품 서버의 금융 투영만 사용하고 목록별 Payment 조회를 하지 않는다. */
export function AdvertisingBadge({ advertising }: { advertising?: AdvertisingSummary }) {
  return ADVERTISING ? <span className="rounded-inner bg-soft px-2 py-1 text-footnote">{advertisingLabel(advertising)}</span> : null;
}
export function AdvertisingDetails({ advertising }: { advertising?: AdvertisingSummary }) {
  if (!ADVERTISING) return null;
  return <section className="space-y-2 rounded-element border border-line p-4"><h2 className="font-bold">광고 신청</h2><AdvertisingBadge advertising={advertising}/>
    {advertising?.requested && <><p>최초 등록 광고비 {advertising.amount == null ? '확인 중' : money(advertising.amount)}</p><p className="text-footnote">최초 판매가 × 최초 판매 수량 × 5%를 원 단위로 버림한 금액이에요. 승인 후 수정 심사에서도 최초 결제 금액을 유지해요.</p><p className="break-all text-footnote">신청 회차 {advertising.submissionId}</p><p className="text-footnote">결제 시각 {advertising.paidAt ? new Date(advertising.paidAt).toLocaleString('ko-KR') : '미확인'}</p><p className="text-footnote">취소 시각 {advertising.canceledAt ? new Date(advertising.canceledAt).toLocaleString('ko-KR') : '미확인'}</p><p>운영 준비 상태 {advertising.fulfillmentStatus === 'READY' ? '광고 쿠폰 수동 생성 준비' : '상품 승인 대기'}</p>
      {advertising.paymentStatus === 'PAID' && advertising.fulfillmentStatus === 'READY' && <p className="text-footnote">광고 쿠폰 만들기: 운영자 쿠폰 관리에서 이 상품 전용 5% 받기 쿠폰을 수동 생성하고 SNS에 안내해 주세요.</p>}</>}
  </section>;
}
