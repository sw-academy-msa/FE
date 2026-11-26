import { useEffect, useState } from 'react';
import { BottomSheet, Button, ErrorBox, InfoRow, LiveStatus } from '../components/ui';
import { useApi } from '../api/hooks';
import { claimCampaign, claimError, couponConditionLabel, couponDiscountLabel, getCampaign } from '../api/coupons';
import { trackCouponClaim } from '../behavior';

/** 알림 딥링크는 마이페이지 위에서 기존 조회와 받기 API를 사용한다. */
export function ClaimCampaignSheet({ code, onClose, onClaimed }: { code: string; onClose: () => void; onClaimed: () => void }) {
  const valid = /^[A-Z0-9_]{1,40}$/.test(code);
  const st = useApi(signal => valid ? getCampaign(code, signal) : Promise.resolve(null), [code]);
  const [busy, setBusy] = useState(false), [received, setReceived] = useState(false), [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const data = st.data;
  const claimed = received || !!data?.claimed;
  const expired = !!data && Date.parse(data.campaign.endsAt) <= now;
  const closed = !!data && (data.campaign.kind !== 'CLAIM' || data.campaign.status !== 'ACTIVE' || data.remaining <= 0 || Date.parse(data.campaign.startsAt) > now);
  async function claim() {
    if (busy || claimed || closed || expired) return;
    setBusy(true); setError('');
    try { const c = await claimCampaign(code); setReceived(true); trackCouponClaim(code, c.issueId); onClaimed(); st.reload(); }
    catch (e) { setError(claimError(e)); st.reload(); }
    finally { setBusy(false); }
  }
  return <BottomSheet title="쿠폰 받기" onClose={onClose}>
    <LiveStatus state={st}/>
    {!valid && <ErrorBox message="받을 수 없는 쿠폰이에요. 캠페인이 끝났거나 주소가 잘못됐어요."/>}
    {data && <div className="space-y-3">
      <h2 className="break-words text-heading font-bold">{data.definition.name}</h2>
      <p className="text-title font-bold">{couponDiscountLabel(data.definition)}</p>
      <p className="muted text-label">{couponConditionLabel(data.definition)}</p>
      <InfoRow label="남은 수량" value={`${data.remaining.toLocaleString('ko-KR')}장`}/>
      <ErrorBox message={error}/>
      <Button className="w-full" disabled={busy || claimed || closed || expired} onClick={claim}>{claimed ? '받음' : expired ? '만료' : closed ? '마감' : busy ? '받는 중…' : '받기'}</Button>
    </div>}
    <Button outline closeSheet className="mt-3 w-full">닫기</Button>
  </BottomSheet>;
}
