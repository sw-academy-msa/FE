import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, ErrorBox, Header } from '../components/ui';
import { activeUser, money } from '../domain';
import { useStore, mutate } from '../store';
import { getSellerProduct } from '../api/sellerProducts';
import { mergeProducts } from '../api/products';
import { errorMessage } from '../api/errors';
import { loadToss } from '../api/orders';
import { captureAdvertisingReturn, advertisingCheckout, advertisingPayment, advertisingPaymentId, advertisingSubmission, abandonAdvertising, completeAdvertising, readAdvertisingContext, readAdvertisingReturn, rememberAdvertising } from '../api/advertising';
import type { AdvertisingCheckout, AdvertisingContext } from '../api/advertising';

/** 결제 준비 및 전용 귀환을 처리하고 PAID와 실제 심사 접수 완료를 구분한다. */
export function AdvertisingPaymentPage() {
  const params = useParams();
  captureAdvertisingReturn();
  return <AdvertisingPaymentView key={params.result ?? `${params.productId}/${params.applicationId}`}/>;
}
function AdvertisingPaymentView() {
  const params = useParams(), navigate = useNavigate(), store = useStore(), user = activeUser(store);
  const [error, setError] = useState(''), [message, setMessage] = useState('광고 결제 준비를 확인하고 있어요.'), [attempt, setAttempt] = useState(0);
  const [checkout, setCheckout] = useState<AdvertisingCheckout | null>(null), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const context = useRef<AdvertisingContext | null>(null);
  const pay = useRef<(() => Promise<void>) | null>(null);
  const [ret] = useState(readAdvertisingReturn);

  useEffect(() => {
    let stopped = false;
    setError(''); setCheckout(null); setReady(false);
    const run = async () => {
      let c: AdvertisingContext | null = params.productId && params.applicationId ? { productId: params.productId, applicationId: params.applicationId } : readAdvertisingContext();
      const paymentId = advertisingPaymentId(ret?.orderId ?? null);
      if (params.result && paymentId) {
        const payment = await advertisingPayment(paymentId);
        c = { productId: payment.productId, applicationId: payment.applicationId, paymentId };
        if (params.result === 'success' && ret?.paymentKey) {
          if (ret.amount !== payment.amount || !Number.isSafeInteger(ret.amount)) throw new Error('서버 광고비와 결제 금액이 일치하지 않아요. 판매 내역에서 상태를 확인해 주세요.');
          await completeAdvertising(paymentId, ret.paymentKey, ret.orderId!);
        }
      }
      if (!c) throw new Error('확인할 광고 신청이 없어요. 판매 상품에서 다시 확인해 주세요.');
      context.current = c; rememberAdvertising(c);
      if (params.result === 'fail') {
        const status = await advertisingSubmission(c.productId, c.applicationId);
        // 실패 귀환 자체를 금융 실패로 확정하지 않고 승인 전 중단 의도만 접수한다.
        if (status.paymentStatus === 'PENDING' && status.intentStatus === 'WAITING_PAYMENT') await abandonAdvertising(c.productId, c.applicationId);
      }
      const end = Date.now() + 180000;
      while (!stopped) {
        const status = await advertisingSubmission(c.productId, c.applicationId);
        if (stopped) return;
        if (status.intentStatus === 'SUBMITTED') {
          const product = await getSellerProduct(c.productId);
          mutate(s => { mergeProducts(s, [product]); delete s.drafts[user.id]; });
          navigate(`/seller/published/${c.productId}`, { replace: true }); return;
        }
        if (status.paymentStatus === 'FAILED' || status.paymentStatus === 'CANCELED') {
          setMessage(status.paymentStatus === 'CANCELED' ? '광고비 전액 취소가 확인됐어요.' : '광고 결제가 완료되지 않았어요. 상품을 다시 확인해 주세요.'); return;
        }
        if (!params.result && status.checkoutReady && status.paymentAttemptId) {
          c.paymentId = status.paymentAttemptId; rememberAdvertising(c);
          const prepared = await advertisingCheckout(status.paymentAttemptId);
          if (!stopped) setCheckout(prepared); return;
        }
        setMessage(status.cancellationStatus === 'REQUESTED' || status.cancellationStatus === 'RETRYING' ? '광고비 취소를 확인하고 있어요.' : status.paymentStatus === 'PAID' ? '결제 완료, 심사 접수를 확인하고 있어요.' : '결제를 확인하고 있어요. 화면을 닫아도 서버 처리는 계속돼요.');
        if (Date.now() >= end) { setMessage('처리가 지연되고 있어요. 다시 확인할 수 있어요.'); return; }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    };
    run().catch(e => { if (!stopped) setError(errorMessage(e)); });
    return () => { stopped = true; };
  }, [params.productId, params.applicationId, params.result, attempt, ret, user.id, navigate]);

  useEffect(() => {
    if (!checkout) return;
    let stopped = false;
    const setup = async () => {
      if (!checkout.clientKey.startsWith('test_') || !Number.isSafeInteger(checkout.amount) || checkout.amount < 1000 || !advertisingPaymentId(checkout.tossOrderId)) throw new Error('테스트 결제 설정을 확인할 수 없어요.');
      const Toss = await loadToss();
      const request = { orderId: checkout.tossOrderId, orderName: '판매 등록 광고 테스트 결제', successUrl: checkout.successUrl, failUrl: checkout.failUrl };
      if (checkout.clientKey.startsWith('test_gck_')) {
        const widgets = Toss(checkout.clientKey).widgets({ customerKey: user.id });
        await widgets.setAmount({ currency: 'KRW', value: checkout.amount });
        await widgets.renderPaymentMethods({ selector: '#advertising-methods', variantKey: 'DEFAULT' });
        await widgets.renderAgreement({ selector: '#advertising-agreement', variantKey: 'AGREEMENT' });
        if (!stopped) pay.current = () => widgets.requestPayment(request);
      } else {
        const payment = Toss(checkout.clientKey).payment({ customerKey: user.id });
        if (!stopped) pay.current = () => payment.requestPayment({ ...request, method: 'CARD', amount: { currency: 'KRW', value: checkout.amount } });
      }
      if (!stopped) setReady(true);
    };
    setup().catch(() => { if (!stopped) setError('테스트 결제창을 준비하지 못했어요. 다시 확인해 주세요.'); });
    return () => { stopped = true; pay.current = null; };
  }, [checkout, user.id]);

  const cancel = async () => {
    if (!context.current) return;
    setBusy(true); setError('');
    try { await abandonAdvertising(context.current.productId, context.current.applicationId); setAttempt(x => x + 1); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return <div className="space-y-4"><Header title="광고 테스트 결제"/><p role="status">{checkout ? `광고비 ${money(checkout.amount)}` : message}</p>
    <p className="text-footnote text-meta">테스트 결제예요. 결제가 확인되면 서버가 자동으로 판매 심사를 접수해요. 최초 심사 반려 시 광고비를 전액 취소해요.</p>
    {error && <ErrorBox message={error}/>}
    <div id="advertising-methods"/><div id="advertising-agreement"/>
    {checkout && <><Button className="w-full" disabled={!ready || busy} onClick={async () => { if (!pay.current) return; setBusy(true); try { await pay.current(); } catch { await cancel(); } finally { setBusy(false); } }}>광고비 {money(checkout.amount)} 결제하고 심사 요청</Button><Button className="w-full" disabled={busy} onClick={cancel}>결제 중단 요청</Button></>}
    {!checkout && <Button className="w-full" onClick={() => setAttempt(x => x + 1)}>다시 확인</Button>}
    <Button className="w-full" to="/seller/products">판매 상품으로</Button></div>;
}
