import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { getCheckout, mergeCheckout, openTossPayment } from '../api';
import { handoffOrder, markHandoff, TOSS_START_PATH } from '../externalPay';
import { defaultTossDeps, hasTossParams, orderIdOfToss, processTossSuccess, readTossParams, readTossPending, readTossReturn, rememberTossPending, stashTossReturn, tossFailure, TOSS_RETURN_PATH } from '../api/tossReturn';
import type { TossOutcome, TossReturn } from '../api/tossReturn';
import { errorMessage } from '../api/errors';
import { loginHref, signedIn } from '../auth';
import { Empty, ErrorBox, Header } from '../components/ui';
import { mutate, useStore } from '../store';
import { USE_MOCK } from '../config';

/**
 * 토스 결제창에서 돌아오는 화면(#/payments/toss/success · fail).
 * 1) 쿼리(해시 앞·안)를 읽어 보관하고 주소에서 지운다(새로고침·뒤로 가기에 다시 처리되지 않게)
 * 2) 로그인이 안 돼 있으면(아이폰 홈 화면 앱 → 사파리로 열린 경우 등) 로그인 후 이 화면으로 돌아와 이어서 처리
 * 3) 성공: 승인 요청(한 번만) → 확정까지 확인 → 결제 완료 / 실패 / 지연. 실패: 토스 code·message로 결제 실패 화면
 */
/** 성공·실패 주소가 바뀌면 새로 처리한다(같은 문서 안에서 해시만 바뀌어도) */
export function TossReturnPage() { const { result } = useParams(); return result === 'start' ? <TossStartView/> : <TossReturnView key={result} result={result}/>; }

/**
 * 홈 화면 앱에서 넘어온 결제를 시스템 브라우저(Safari, Chrome)에서 시작하는 화면(#/payments/toss/start?order=주문id).
 * 브라우저에는 앱의 로그인 상태가 없어(쿠키 저장소가 따로) 처음 한 번은 로그인한다. 이후엔 브라우저 쿠키로 유지된다.
 * 주문 상태와 금액은 서버(checkout)에서 다시 확인하고, 재고를 확보한 상태(HELD)일 때만 토스 결제창을 같은 탭으로 연다.
 */
function TossStartView() {
  const s = useStore(), navigate = useNavigate(), [params] = useSearchParams(); const orderId = params.get('order') ?? '';
  const [note, setNote] = useState<{ title: string; text: string } | null>(null), [error, setError] = useState(''); const started = useRef(false);
  const logged = signedIn(s);
  useEffect(() => {
    if (USE_MOCK || !orderId || started.current) return;
    markHandoff(orderId); // 결제가 끝나면 이 브라우저에서는 '앱으로 돌아가 주세요'를 보여 준다
    if (!logged) { navigate(loginHref(`${TOSS_START_PATH}?order=${encodeURIComponent(orderId)}`), { replace: true }); return; }
    started.current = true;
    (async () => {
      const cur = await getCheckout(orderId); mutate(st => mergeCheckout(st, cur));
      if (cur.state === 'CONFIRMED') { setNote({ title: '이미 결제가 완료된 주문이에요', text: 'STOCKDROP 앱으로 돌아가 주문 내역을 확인해 주세요.' }); return; }
      if (cur.state === 'FAILED' || cur.state === 'EXPIRED') { setNote({ title: cur.state === 'EXPIRED' ? '결제 시간이 지났어요' : '결제를 진행할 수 없는 주문이에요', text: 'STOCKDROP 앱으로 돌아가 다시 주문해 주세요.' }); return; }
      if (cur.state !== 'HELD' || cur.totalAmount == null) { setNote({ title: '결제를 확인하고 있어요', text: 'STOCKDROP 앱으로 돌아가 결제 결과를 확인해 주세요.' }); return; }
      await openTossPayment({ orderId, orderName: cur.productName ?? 'STOCKDROP 주문', amount: cur.totalAmount, tossOrderId: cur.tossOrderId });
    })().catch(e => setError(`${errorMessage(e)} 앱과 같은 계정으로 로그인했는지 확인해 주세요.`));
  }, [orderId, logged]);
  if (USE_MOCK || !orderId) return <Empty title="처리할 결제가 없어요" message="STOCKDROP 앱에서 결제를 다시 시작해 주세요."/>;
  if (error) return <div className="space-y-4"><Header title="결제" back={false}/><ErrorBox message={error}/><p className="muted text-[13px]">STOCKDROP 앱으로 돌아가 다시 시도해 주세요.</p></div>;
  if (note) return <AppReturn title={note.title} text={note.text}/>;
  return <div role="status" aria-live="polite" className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-center"><Loader2 size={28} className="animate-spin"/><h1 className="text-[18px] font-bold">결제창을 여는 중이에요</h1><p className="muted text-[12px]">잠시만 기다려 주세요.</p></div>;
}
/** 브라우저에서 결제를 마친 뒤 앱으로 돌아가라는 안내(아이폰은 Safari에서 앱으로 자동으로 돌아가지 않는다) */
function AppReturn({ title, text, orderLink }: { title: string; text: string; orderLink?: string }) {
  return <div role="status" aria-label="앱으로 돌아가기 안내" className="flex min-h-[60dvh] flex-col justify-center gap-4"><h1 className="text-[22px] font-bold leading-snug">{title}</h1><p className="muted text-[13px] leading-relaxed">{text}</p><p className="rounded-[6px] bg-[var(--soft)] p-3.5 text-[12px] leading-relaxed text-[var(--aux)]">홈 화면의 STOCKDROP 앱을 다시 열면 결과가 바로 보여요. 이 창은 닫아도 돼요.</p>{orderLink && <Link className="btn btn-outline w-full" to={orderLink}>이 브라우저에서 주문 보기</Link>}</div>;
}
function TossReturnView({ result }: { result?: string }) {
  const navigate = useNavigate(); const s = useStore();
  const [ret] = useState<TossReturn | null>(() => {
    const p = readTossParams(window.location);
    if (hasTossParams(p)) { const r: TossReturn = { ...p, result: result === 'fail' ? 'fail' : 'success' }; stashTossReturn(r); return r; }
    return readTossReturn(); // 쿼리를 지운 뒤 새로고침했거나 로그인하고 돌아왔다
  });
  // 주소의 paymentKey 등을 지운다(해시 앞 쿼리 포함)
  useEffect(() => { const path = ret ? TOSS_RETURN_PATH[ret.result] : TOSS_RETURN_PATH.success; if (window.location.search || window.location.hash.includes('?')) history.replaceState(history.state, '', `${window.location.pathname}#${path}`); }, []);
  const [outcome, setOutcome] = useState<TossOutcome | null>(null), [error, setError] = useState(''); const started = useRef(false);
  // 홈 화면 앱에서 넘어온 결제면(브라우저) 결과 화면으로 옮기지 않고 앱으로 돌아가라고 안내한다
  const [handoff] = useState(() => !!handoffOrder());
  const logged = signedIn(s);
  useEffect(() => {
    if (USE_MOCK || !ret || started.current) return;
    if (!logged) { navigate(loginHref(TOSS_RETURN_PATH[ret.result]), { replace: true }); return; } // 보관한 값으로 로그인 뒤 이어서
    started.current = true;
    const run = ret.result === 'fail' ? Promise.resolve(tossFailure(readTossPending()?.orderId ?? (ret.orderId ? orderIdOfToss(ret.orderId) : ''), ret.code, ret.message))
      : processTossSuccess(ret, readTossPending(), { ...defaultTossDeps(), onUpdate: d => mutate(st => mergeCheckout(st, d)) });
    run.then(o => { setOutcome(o); if (o.kind !== 'delayed') { stashTossReturn(null); rememberTossPending(null); } }).catch(e => setError(errorMessage(e)));
  }, [ret, logged]);
  // 결과 화면으로: 확정 → 결제 완료(Figma), 실패 → 결제 실패와 취소(Figma, 결제 화면이 보여 준다)
  useEffect(() => {
    if (!outcome) return;
    if (handoff) { if (outcome.kind !== 'delayed') markHandoff(null); return; }
    if (outcome.kind === 'confirmed') navigate(`/orders/${outcome.checkout.orderId}?complete=1`, { replace: true });
    else if (outcome.kind === 'failed' && outcome.orderId) navigate(`/checkout/${outcome.orderId}`, { replace: true, state: outcome.checkout && ['FAILED', 'EXPIRED'].includes(outcome.checkout.state) ? null : { payFailure: { code: outcome.code, message: outcome.message } } });
  }, [outcome]);
  if (USE_MOCK || !ret) return <Empty title="처리할 결제가 없어요" message="주문 내역에서 결제 상태를 확인해 주세요."><Link className="btn" to="/orders">주문 내역</Link></Empty>;
  if (error) return <div className="space-y-4"><Header title="결제 확인"/><ErrorBox message={error}/><Link className="btn w-full" to="/orders">주문 내역</Link></div>;
  if (handoff && outcome?.kind === 'confirmed') return <AppReturn title="결제가 완료됐어요" text="STOCKDROP 앱으로 돌아가면 주문 결과를 볼 수 있어요." orderLink={`/orders/${outcome.checkout.orderId}?complete=1`}/>;
  if (handoff && outcome?.kind === 'failed') return <AppReturn title={outcome.code === 'PAY_PROCESS_CANCELED' ? '결제를 취소했어요' : '결제가 완료되지 않았어요'} text={`${outcome.code === 'PAY_PROCESS_CANCELED' ? '' : `${outcome.message ?? outcome.code} `}STOCKDROP 앱으로 돌아가 다시 결제하거나 주문 상태를 확인해 주세요.`}/>;
  if (handoff && outcome?.kind === 'delayed') return <AppReturn title="결제 확인이 늦어지고 있어요" text="STOCKDROP 앱으로 돌아가 주문 내역에서 확인해 주세요. 결제가 확정되면 바로 보여요."/>;
  if (outcome?.kind === 'delayed') return <div className="space-y-4"><Header title="결제 확인"/><h2 className="text-[20px] font-bold">결제 확인이 늦어지고 있어요</h2><p className="muted text-[13px] leading-relaxed">주문 내역에서 확인해 주세요. 결제가 확정되면 주문 내역에 바로 보여요.</p><Link className="btn w-full" to="/orders">주문 내역</Link></div>;
  if (outcome?.kind === 'failed' && !outcome.orderId) return <div className="space-y-4"><Header title="결제 확인"/><h2 className="text-[20px] font-bold">결제가 완료되지 않았어요</h2><p className="muted text-[13px]">{outcome.message ?? outcome.code}</p><Link className="btn w-full" to="/orders">주문 내역</Link></div>;
  return <div role="status" aria-live="polite" className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-center"><Loader2 size={28} className="animate-spin"/><h1 className="text-[18px] font-bold">결제를 확정하고 있어요</h1><p className="muted text-[12px]">창을 닫지 말고 잠시만 기다려 주세요.</p></div>;
}
