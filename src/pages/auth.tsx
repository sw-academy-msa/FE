import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { Icon } from '../components/icons';
import { CodeInput } from '../components/CodeInput';
import { Button, ErrorBox, Field, Header, Modal, Note, useLeaveGuard, useToast } from '../components/ui';
import { getState, mutate, useStore } from '../store';
import { initialAuth } from '../domain';
import { enrollAnalytics, syncAnalyticsIdentity, withdrawAnalytics } from '../analytics';
import { applyRecommendation, recommendationOn } from '../recommendation';
import type { ApiError } from '../api';
import { errorMessage, fieldErrors, fetchMySettings, saveMarketingConsent, saveNotificationSettings } from '../api';
import { SignupLoginError, ensureSession, flushPendingPrefs, setPendingPrefs, loginHref, homePath, login, logout, normalizeEmail, resetPassword, safeNext, sendCode, signedIn, signup, validEmail, validPassword, verifyCode, demoLogin } from '../auth';
import { DEMO_ACCOUNTS, DEMO_LOGIN, PUSH_DEBUG, USE_MOCK } from '../config';
import { PushDebug } from '../components/PushDebug';
import { PUSH_DENIED_TEXT, canSubscribePush, enablePush, pushPermission, pushState, requestPushPermission } from '../push';
import type { PushState } from '../push';
const inputClass = 'field placeholder:text-muted disabled:opacity-50';
/** 회색 입력칸 안에 버튼이 들어가는 칸(시안 회원가입 이메일 + 인증번호 요청)의 입력 */
const inlineInput = 'min-w-0 flex-1 bg-transparent py-2.5 outline-none placeholder:text-muted';
function useAuthNow() { const [now, setNow] = useState(Date.now()); useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []); return now; }
const DEMO_NEXT_KEY = 'stockdrop:demo-next';
function useNext() { const [params] = useSearchParams(); return safeNext(params.get('next')); }
/** 가입 없이 둘러보기: 첫 방문 안내를 마친 것으로 저장하고 이 탭에서는 시작 화면으로 다시 보내지 않는다 */
function markOnboarded() { mutate(s => { (s.auth ??= initialAuth()).onboarded = true; }); sessionStorage.setItem('stockdrop:guest-session', '1'); }
/** 시안 2단계 · 로그인의 Brand: 가운데 로고(폭 210), 위 56 아래 44 */
function Wordmark() { return <div className="flex justify-center pb-11 pt-14"><BrandLogo width={210}/></div>; }
/** 시안 2단계 · 로그인·회원가입: 뒤로 가기와 제목(구분선 없음), 로고, 본문 */
function AuthShell({ title, children, onBack }: { title: string; children: ReactNode; onBack?: () => void }) { return <div className="flex min-h-[calc(100dvh-60px)] flex-col px-1 pb-8">{onBack ? <header className="flex min-h-11 items-center gap-1"><button aria-label="이전 화면" onClick={onBack} className="press -ml-3 grid h-11 w-11 place-items-center"><Icon name="Back" size={24}/></button><h1 className="text-title font-bold">{title}</h1></header> : <Header title={title} bare/>}<Wordmark/>{children}</div>; }
function PasswordField({ label = '비밀번호', value, onChange, autoComplete = 'new-password', placeholder = '영문·숫자·특수문자 8~64자', maxLength = 32, error }: { error?: string; maxLength?: number; label?: string; value: string; onChange: (v: string) => void; autoComplete?: string; placeholder?: string }) { const [visible, setVisible] = useState(false); return <Field label={label} required error={error}><div className="relative"><input aria-label={label} type={visible ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} maxLength={maxLength} placeholder={placeholder} className={`${inputClass} pr-14`}/><button type="button" aria-label={`${label} ${visible ? '숨기기' : '보기'}`} onClick={() => setVisible(!visible)} className="absolute right-1.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-text">{visible ? <EyeOff size={22}/> : <Eye size={22}/>}</button></div></Field>; }
/** 시작(시안 온보딩 · 시작): 가운데 로고와 문구, 아래 로그인·회원가입·둘러보기. 첫 방문(온보딩 삭제)도 여기서 시작한다 */
export function WelcomePage() { const next = useNext(), navigate = useNavigate(), s = useStore(); if (signedIn(s)) return <Navigate to={next} replace/>; return <div className="flex min-h-[calc(100dvh-60px)] flex-col px-1 pb-2"><div className="flex flex-1 flex-col items-center justify-center gap-[19px]"><h1><span className="sr-only">STOCKDROP</span><BrandLogo width={210}/></h1><p className="font-number text-label">EVERY DROP, 3 HOURS ONLY</p></div><div className="space-y-2"><Button className="w-full" to={`/login?next=${encodeURIComponent(next)}`}>이메일로 로그인</Button><Button outline className="w-full" to={`/signup?next=${encodeURIComponent(next)}`}>이메일로 회원가입</Button><button className="press flex h-11 w-full items-center justify-center gap-1 text-callout font-semibold text-aux-strong" onClick={() => { markOnboarded(); navigate(next, { replace: true }); }}>가입 없이 둘러보기<Icon name="Caret" size={14}/></button></div></div>; }
export function LoginPage() {
  const s = useStore(), next = useNext(), navigate = useNavigate(); const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [fields, setFields] = useState<Record<string, string>>({});
  // 데모 계정 버튼으로 고른 시작 화면(판매자 → /seller, 운영자 → /admin). 로그인 전 화면에 다시 들어오면 지운다
  useEffect(() => { if (!signedIn(getState())) sessionStorage.removeItem(DEMO_NEXT_KEY); }, []);
  if (signedIn(s)) return <Navigate to={sessionStorage.getItem(DEMO_NEXT_KEY) || (next === '/' ? homePath(s) : next)} replace/>;
  return <AuthShell title="로그인"><form className="space-y-5" onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); setFields({}); try { const home = await login(email, password); navigate(next === '/' ? home : next, { replace: true }); } catch (e) { const f = fieldErrors(e); setFields(f); setError(Object.keys(f).length ? '' : (e as Error).message); } finally { setBusy(false); } }}><Field label="이메일" required error={fields.email}><input aria-label="이메일" autoComplete="username" autoCapitalize="none" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} onBlur={() => setEmail(email.trim())} placeholder="예: stockdrop@example.com" className={inputClass}/></Field><PasswordField value={password} onChange={setPassword} autoComplete="current-password" maxLength={undefined} error={fields.password}/><ErrorBox message={error}/><div className="pt-2"><Button type="submit" className="w-full" disabled={busy || !email.trim() || !password}>{busy ? '로그인 중…' : '로그인'}</Button></div></form><div className="mt-1.5 grid grid-cols-2 text-subhead font-semibold text-aux-strong"><Link to={`/signup?next=${encodeURIComponent(next)}`} className="grid h-12 place-items-center">이메일 회원가입</Link><Link to={`/reset-password?next=${encodeURIComponent(next)}`} className="grid h-12 place-items-center">비밀번호 재설정</Link></div>{DEMO_LOGIN && <div className="mt-8 rounded-element bg-soft p-4"><p className="text-label font-bold">미리보기 계정 · 백엔드 연동 전</p><p className="muted mt-1 text-footnote">서버 없이 목업 데이터로 화면을 확인해요.</p><div className="mt-3 grid grid-cols-3 gap-2">{DEMO_ACCOUNTS.map(a => <Button key={a.id} outline className="min-h-10! px-2 text-label!" onClick={() => { sessionStorage.setItem(DEMO_NEXT_KEY, a.id === 'seller' ? '/seller' : a.id === 'admin' ? '/admin' : next); demoLogin(a.id); }}>{a.label}로 보기</Button>)}</div></div>}<div className="mt-auto flex flex-col items-center pt-10"><p className="muted text-body">하나의 계정으로 구매하고, 승인 후 판매까지.</p><button className="press flex h-12 items-center gap-1 text-subhead font-bold" onClick={() => { markOnboarded(); navigate('/'); }}>상품 먼저 둘러보기<Icon name="Caret" size={16}/></button></div></AuthShell>;
}
function EmailVerification({ email, setEmail, purpose, onError }: { email: string; setEmail: (v: string) => void; purpose: 'signup' | 'reset'; onError: (v: string) => void }) {
  const s = useStore(), c = s.auth?.challenges[`${purpose}:${normalizeEmail(email)}`]; const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [now, setNow] = useState(Date.now()), [codeError, setCodeError] = useState('');
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const verified = !!c?.verified && c.expiresAt > now, remain = Math.max(0, Math.ceil(((c?.expiresAt ?? now) - now) / 1000)), cooldown = c ? Math.max(0, Math.ceil((c.sentAt + 60000 - now) / 1000)) : 0;
  const remainLabel = remain ? `${Math.floor(remain / 60).toString().padStart(2, '0')}:${String(remain % 60).padStart(2, '0')}` : '';
  return <div className="space-y-5">
    <Field label="이메일" required><div className="field-inline"><input aria-label="이메일" type="email" autoComplete="email" autoCapitalize="none" value={email} onChange={e => { setEmail(e.target.value); setCode(''); onError(''); setCodeError(''); }} placeholder="가입할 이메일 주소" className={inlineInput}/><Button outline className="min-h-10! shrink-0 px-3.5 text-body!" disabled={busy || !validEmail(email) || cooldown > 0 || verified} onClick={async () => { setBusy(true); onError(''); try { await sendCode(email, purpose); setNow(Date.now()); setCode(''); setCodeError(''); } catch (e) { onError((e as Error).message); } finally { setBusy(false); } }}>{verified ? '인증 완료' : cooldown ? `재요청 ${cooldown}초` : c ? '다시 요청' : '인증번호 요청'}</Button></div></Field>
    {c && !verified && <>
      <p className="text-body text-muted">입력하신 이메일로 인증번호를 보냈어요.<br/>{email}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="text-body font-bold">인증번호</span><span className="text-footnote text-muted">· 필수</span></div>
          {remainLabel && <span className="text-label font-bold text-red">{remainLabel}</span>}
        </div>
        <CodeInput value={code} onChange={v => { setCode(v); setCodeError(''); }} error={!!codeError}/>
        {codeError && <p className="text-label text-red">인증번호가 일치하지 않아요.</p>}
        {!remain && <p className="text-label text-muted">인증 시간이 지났어요. 다시 요청해 주세요.</p>}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-label text-muted">메일을 받지 못했나요?</span>
        <Button outline className="min-h-9! px-3 text-footnote!" disabled={cooldown > 0} onClick={async () => { setBusy(true); onError(''); try { await sendCode(email, purpose); setNow(Date.now()); setCode(''); setCodeError(''); } catch (e) { onError((e as Error).message); } finally { setBusy(false); } }}>{cooldown ? `재전송 (${cooldown}초 후 활성화)` : '재전송'}</Button>
      </div>
      <div className="rounded-inner bg-blue-soft px-4 py-3 text-label text-muted">
        인증번호는 3분 동안 유효해요. 메일이 보이지 않으면 스팸함도 확인해 주세요.
      </div>
      {/* invisible submit button to allow verify on code complete */}
      {code.length === 6 && remain > 0 && <Button outline className="w-full" disabled={busy} onClick={async () => { setBusy(true); onError(''); setCodeError(''); try { const error = await verifyCode(email, purpose, code); if (error) { setCodeError(error); onError(error); setCode(''); } } catch (e) { setCodeError((e as Error).message); onError((e as Error).message); } finally { setBusy(false); } }}>인증 확인</Button>}
    </>}
    {verified && <p role="status" className="flex items-center gap-2 text-label text-green"><ShieldCheck size={15}/>이메일 인증이 완료되었어요.</p>}
  </div>;
}
export function LegalContent({ kind }: { kind: string }) { return <div className="space-y-5 text-label leading-[1.9]"><p className="text-caption font-bold tracking-[1px]">STOCKDROP · {kind === 'privacy' ? 'PRIVACY' : 'TERMS'}</p>{kind === 'privacy' ? <><h2 className="font-bold">개인정보 수집·이용 안내</h2><p>계정 생성과 로그인, 주문·배송, 문의 응대를 위해 이메일·이름·연락처를 이용합니다. 배송지는 주문 시 별도로 입력합니다.</p><p>판매자 신청 시 사업자등록증 PDF, 담당자 정보, 정산·출고·반품 정보를 추가로 수집합니다. 판매자 승인은 제출 서류 검토 후 진행됩니다.</p><p>주문 이행에 필요한 수령인·연락처·배송지는 해당 주문의 판매자에게 제공됩니다. 주문 문의의 개인정보는 공개 FAQ로 게시하지 않습니다.</p><p>수집 목적이 달성되면 정보를 삭제하며, 관련 법령상 보관이 필요한 거래 정보는 해당 기간 보관합니다.</p><p>필수 정보 수집에 동의하지 않을 수 있으나 회원가입과 거래 이용이 제한됩니다.</p></> : <><h2 className="text-subhead font-bold">서비스 이용 안내</h2><p className="muted">STOCKDROP을 이용하기 전에 꼭 알아두실 내용이에요.</p><div className="grid grid-cols-3 gap-2 rounded-inner bg-blue-soft p-4 text-center"><div><p className="font-number text-title-lg font-bold">3시간</p><p className="muted text-caption">판매 진행 시간</p></div><div><p className="font-number text-title-lg font-bold">5분</p><p className="muted text-caption">확보 후 결제 기한</p></div><div><p className="font-number text-title-lg font-bold">새 상품</p><p className="muted text-caption">거래 대상</p></div></div><section className="space-y-4"><h3 className="font-bold">01 {'  '}회원 및 판매자 자격</h3><p>회원은 구매자로 시작하며, 판매는 사업자등록증 PDF 제출 및 운영자 승인 후 가능합니다. 판매자 승인 후에도 구매 권한과 기존 내역은 유지됩니다.</p><h3 className="font-bold">02 {'  '}거래 가능 상품</h3><p>의류·패션잡화·문구·일반 생활잡화의 미판매 새 상품을 거래합니다. 중고·전시·하자 상품과 식품·건강기능식품·화장품·전기제품은 지원하지 않습니다.</p><h3 className="font-bold">03 {'  '}판매 시간과 결제</h3><p>판매는 시작 후 3시간입니다. 옵션 선택만으로 재고가 확보되지 않으며, 구매하기로 확보에 성공한 뒤 5분 안에 결제해야 합니다. 결제 결과 확인 중인 재고는 결과가 확정되기 전 반환되지 않습니다.</p><h3 className="font-bold">04 {'  '}취소 · 반품 · 오배송</h3><p>취소·반품·하자·오배송은 주문 상세에서 판매자에게 문의합니다. 법령상 소비자의 권리는 별도로 보장됩니다.</p><h3 className="font-bold">05 {'  '}배송완료 처리</h3><p>판매자의 수동 배송완료 처리는 구매확정이나 정산 송금을 의미하지 않습니다.</p><h3 className="font-bold">06 {'  '}정산 및 판매 수수료</h3><p>판매 수수료는 월 판매액(구매 확정 기준)의 10%예요. 쿠폰 할인 전 상품 금액을 기준으로 하며 배송비는 제외해요. 정산은 구매 확정 기준으로 월별 집계하며 수수료의 원 미만은 버리고 판매액에서 수수료를 뺀 금액을 지급 예정액으로 안내합니다.</p></section></>}</div>; }
export function LegalPage() { const [params] = useSearchParams(); const kind = params.get('kind') || 'terms'; return <><Header title={kind === 'privacy' ? '개인정보 수집·이용' : '서비스 이용약관'}/><LegalContent kind={kind}/></>; }
/** 회원가입 1단계: 이름 + 이메일 인증 → /signup/info 로 이동 */
export function SignupPage() {
  const s = useStore(), next = useNext(), navigate = useNavigate();
  const [email, setEmail] = useState(''), [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [exists, setExists] = useState(false), [fields, setFields] = useState<Record<string, string>>({});
  // 작성 중: 이메일이나 이름을 적었을 때. 인증번호 화면으로 넘어가는 것은 막지 않는다
  useLeaveGuard(!!email.trim() || !!name.trim(), { allow: p => p === '/signup/verify' });
  if (signedIn(s)) return <Navigate to={next} replace/>;
  const handleSend = async () => {
    if (!validEmail(email) || !name.trim() || busy) return;
    setBusy(true); setError(''); setFields({});
    try {
      await sendCode(email, 'signup');
      navigate(`/signup/verify?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&next=${encodeURIComponent(next)}`);
    } catch (e) { const f = fieldErrors(e); setFields(f); setError(Object.keys(f).length ? '' : (e as Error).message); setExists((e as ApiError).code === 'ACCOUNT_EMAIL_ALREADY_EXISTS'); }
    finally { setBusy(false); }
  };
  return (
    <AuthShell title="이메일 회원가입" onBack={() => navigate(`/welcome?next=${encodeURIComponent(next)}`)}>
      <div className="-mt-5 mb-10 flex items-end justify-between gap-3">
        <p className="text-title-lg font-extrabold leading-[27px] tracking-[-.4px]">이름과 이메일을 입력해 주세요.</p>
        <span className="muted shrink-0 text-body font-medium">01 / 02</span>
      </div>
      <div className="space-y-5">
        <Field label="이름" required><input aria-label="이름" value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={30} placeholder="실명을 입력해 주세요" className={inputClass}/></Field>
        <Field label="이메일" required error={fields.email}><div className="field-inline"><input aria-label="이메일" type="email" autoComplete="email" autoCapitalize="none" value={email} onBlur={() => setEmail(email.trim())} onChange={e => { setEmail(e.target.value); setError(''); setExists(false); }} placeholder="가입할 이메일 주소" className={inlineInput}/><Button outline className="min-h-10! shrink-0 px-3.5 text-body!" disabled={busy || !validEmail(email) || !name.trim()} onClick={handleSend}>{busy ? '전송 중…' : '인증번호 요청'}</Button></div>{exists && <div className="mt-2 flex items-center justify-between gap-3"><p role="alert" className="text-label text-red">이미 가입된 이메일이에요.</p><Button outline to={`/login?next=${encodeURIComponent(next)}`} className="min-h-9! shrink-0 px-3 text-footnote!">로그인하러 가기</Button></div>}</Field>
        <p className="muted text-body leading-[21px]">구매와 판매에 사용할 하나의 계정을 만들어요.<br/>판매자 신청은 가입 후 마이페이지에서 진행할 수 있어요.</p>
        <ErrorBox message={exists ? '' : error}/>
      </div>
    </AuthShell>
  );
}
export function SignupVerifyPage() {
  const s = useStore(), navigate = useNavigate();
  const [params] = useSearchParams();
  const email = params.get('email') || '', name = params.get('name') || '', next = safeNext(params.get('next'));
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [codeError, setCodeError] = useState(''), [error, setError] = useState(''), [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  // 작성 중: 인증번호를 적었을 때. 가입 정보 입력으로 넘어가는 것은 막지 않는다
  useLeaveGuard(!!code, { allow: p => p === '/signup/info' });
  const c = s.auth?.challenges[`signup:${normalizeEmail(email)}`];
  const remain = Math.max(0, Math.ceil(((c?.expiresAt ?? now) - now) / 1000));
  const cooldown = c ? Math.max(0, Math.ceil((c.sentAt + 60000 - now) / 1000)) : 0;
  const remainLabel = remain ? `${Math.floor(remain / 60).toString().padStart(2, '0')}:${String(remain % 60).padStart(2, '0')}` : '';
  if (!email || !name) return <Navigate to={`/signup?next=${encodeURIComponent(next)}`} replace/>;
  if (signedIn(s)) return <Navigate to={next} replace/>;
  const goNext = () => navigate(`/signup/info?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&next=${encodeURIComponent(next)}`, { replace: true });
  const resend = async () => { setBusy(true); setError(''); try { await sendCode(email, 'signup'); setNow(Date.now()); setCode(''); setCodeError(''); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const verify = async () => { setBusy(true); setError(''); setCodeError(''); try { const err = await verifyCode(email, 'signup', code); if (err) { setCodeError(err); setCode(''); } else goNext(); } catch (e) { setCodeError((e as Error).message); } finally { setBusy(false); } };
  return (
    <AuthShell title="이메일 인증" onBack={() => navigate(`/signup?next=${encodeURIComponent(next)}`)}>
      <p className="mb-7 text-title-lg font-bold tracking-[-.7px]">입력하신 이메일로 인증번호를 보냈어요.</p>
      <div className="space-y-5">
        <p className="text-body text-muted">{normalizeEmail(email)}</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><span className="text-body font-bold">인증번호</span><span className="text-footnote text-muted">· 필수</span></div>
            {remainLabel && <span className="text-label font-bold text-red">{remainLabel}</span>}
          </div>
          <CodeInput value={code} onChange={v => { setCode(v); setCodeError(''); }} error={!!codeError}/>
          {codeError && <p className="text-label text-red">인증번호가 일치하지 않아요.</p>}
          {!remain && <p className="text-label text-muted">인증 시간이 지났어요. 다시 요청해 주세요.</p>}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-label text-muted">메일을 받지 못했나요?</span>
          <Button outline className="min-h-9! px-3 text-footnote!" disabled={busy || cooldown > 0} onClick={resend}>{cooldown ? `재전송 (${cooldown}초 후 활성화)` : '재전송'}</Button>
        </div>
        <div className="rounded-inner bg-blue-soft px-4 py-3 text-label text-muted">인증번호는 3분 동안 유효해요. 메일이 보이지 않으면 스팸함도 확인해 주세요.</div>
        <ErrorBox message={error}/>
        {code.length === 6 && remain > 0 && <Button className="w-full" disabled={busy} onClick={verify}>인증 확인</Button>}
      </div>
    </AuthShell>
  );
}

/** 회원가입 2단계: 비밀번호 + 연락처 + 약관 */
export function SignupInfoPage() {
  const s = useStore(), navigate = useNavigate(), toast = useToast();
  const [params] = useSearchParams();
  const email = params.get('email') || '', nameParam = params.get('name') || '', next = safeNext(params.get('next'));
  const [nameValue, setNameValue] = useState(nameParam);
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [phone, setPhone] = useState(''), [checks, setChecks] = useState({ age: false, terms: false, privacy: false, marketing: false }), [legal, setLegal] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [fields, setFields] = useState<Record<string, string>>({});
  const authNow = useAuthNow(), c = s.auth?.challenges[`signup:${normalizeEmail(email)}`], verified = !!c?.verified && c.expiresAt > authNow;
  // 작성 중: 이름을 바꿨거나 비밀번호, 확인, 휴대폰 번호, 동의 중 하나라도 입력했을 때
  const leave = useLeaveGuard(nameValue !== nameParam || !!password || !!confirmation || !!phone || Object.values(checks).some(Boolean));
  if (signedIn(s) && !busy) return <Navigate to={next} replace/>;
  if (!email || !nameParam) return <Navigate to={`/signup?next=${encodeURIComponent(next)}`} replace/>;
  return (
    <AuthShell title="가입 정보 입력" onBack={() => navigate(`/signup?next=${encodeURIComponent(next)}`)}>
      <p className="mb-6 text-body text-muted">구매와 판매에 사용할 하나의 계정을 만들어요.</p>
      <form className="space-y-6" onSubmit={async e => { e.preventDefault(); if (busy) return; setError(''); if (password !== confirmation) return setError('비밀번호가 일치하지 않습니다.'); setBusy(true); setFields({}); try { await signup({ email, password, name: nameValue.trim(), phone, ...checks }); leave.allowLeave(); navigate(`/signup/done?next=${encodeURIComponent(next)}`, { replace: true }); } catch (e) { if (e instanceof SignupLoginError) { toast('가입은 완료됐어요. 로그인해 주세요.'); navigate(loginHref(`/notifications/settings?next=${encodeURIComponent(next)}`), { replace: true }); return; } const f = fieldErrors(e); setFields(f); setError(Object.keys(f).length && !f.email && !f.verificationToken ? '' : (e as Error).message); } finally { setBusy(false); } }}>
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2 min-w-0"><span className="min-w-0 break-all text-label">{normalizeEmail(email)}</span><span className="shrink-0 rounded-full bg-green-soft px-2 py-0.5 text-caption font-semibold text-green">인증 완료</span></div>
          <button type="button" onClick={() => navigate(`/signup?next=${encodeURIComponent(next)}`)} className="muted shrink-0 p-2 text-footnote underline">이메일 변경</button>
        </div>
        {!verified && <Note>인증 시간이 지났어요. 이메일을 다시 인증해 주세요.</Note>}
        <Field label="이름" required error={fields.name}><input aria-label="이름" value={nameValue} onChange={e => setNameValue(e.target.value)} autoComplete="name" maxLength={30} className={inputClass}/></Field>
        <Field label="휴대폰 번호" required hint="주문·배송 및 문의 연락처로 사용해요."><input aria-label="휴대폰 번호" type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" maxLength={13} placeholder="01012345678" className={inputClass}/></Field>
        <PasswordField value={password} onChange={setPassword} error={fields.password}/>
        <PasswordField label="비밀번호 확인" value={confirmation} onChange={setConfirmation} placeholder="비밀번호를 한 번 더 입력해 주세요"/>
        {confirmation && confirmation !== password && <p className="text-footnote text-red">비밀번호가 일치하지 않아요.</p>}
        <fieldset className="space-y-3 border-t border-line pt-5">
          <legend className="sr-only">약관 동의</legend>
          <label className="divider flex items-center gap-3 pb-4 text-callout font-bold"><input aria-label="약관 전체 동의" type="checkbox" checked={Object.values(checks).every(Boolean)} onChange={e => setChecks({ age: e.target.checked, terms: e.target.checked, privacy: e.target.checked, marketing: e.target.checked })} className="h-4 w-4"/>전체 동의</label>
          {([['age', '만 14세 이상', '필수', false], ['terms', '서비스 이용약관', '필수', true], ['privacy', '개인정보 수집·이용', '필수', true], ['marketing', '혜택 및 마케팅 정보 수신', '선택', false]] as const).map(([key, label, badge, hasView]) => <div key={key} className="flex items-center gap-2"><label className="flex min-w-0 flex-1 items-center gap-2 text-footnote"><input type="checkbox" checked={checks[key]} onChange={e => setChecks({ ...checks, [key]: e.target.checked })} className="h-4 w-4 shrink-0"/><span className={`shrink-0 rounded px-1 py-px text-[9px] font-bold ${badge === '필수' ? 'bg-ink text-surface' : 'border border-line text-muted'}`}>{badge}</span>{label}</label>{hasView && <button type="button" aria-label={key === 'terms' ? '이용약관 보기' : '개인정보 동의 내용 보기'} onClick={() => setLegal(key)} className="muted shrink-0 p-2 text-footnote underline">보기</button>}</div>)}
        </fieldset>
        <ErrorBox message={error}/>
        <Button type="submit" className="w-full" disabled={busy || !verified || !nameValue.trim() || !phone || !validPassword(password) || password !== confirmation || !checks.age || !checks.terms || !checks.privacy}>{busy ? '가입 중…' : '가입하기'}</Button>
      </form>
      {legal && <Modal title={legal === 'terms' ? '서비스 이용약관' : '개인정보 수집·이용'} onClose={() => setLegal('')}><LegalContent kind={legal}/><Button className="mt-6 w-full" closeSheet>내용 확인</Button></Modal>}
    </AuthShell>
  );
}
export function SignupDonePage() { const s = useStore(), next = useNext(); if (!signedIn(s)) return <Navigate to="/login" replace/>; const user = s.users.find(u => u.id === s.activeUserId)!; return <div className="flex min-h-[calc(100dvh-60px)] flex-col px-1 pb-2"><div className="flex flex-1 flex-col items-center pt-27 text-center"><BrandLogo width={210}/><Icon name="Check" size={45} className="mt-9 text-ink"/><p className="muted mt-1 text-label font-bold tracking-[1.4px]">WELCOME TO STOCKDROP</p><h1 className="mt-6 break-words text-[34px] font-black leading-[44px] tracking-[-1px]">{user.name}님,<br/>가입을 환영해요</h1><p className="mt-3 text-subhead leading-6 text-aux-strong">지금부터 3시간 한정 드롭에 바로 참여할 수 있어요.</p></div><div className="space-y-2.5"><Button className="w-full" to={`/notifications/settings?next=${encodeURIComponent(next)}`}>상품 둘러보기</Button><Button outline className="w-full" to="/apply">판매자 입점 신청</Button><p className="muted text-center text-label leading-[18px]">입점 신청만으로 판매 권한이 추가되지는 않습니다.</p></div></div>; }
/** 비밀번호 재설정 1단계: 이메일 인증 → /reset-password/new 로 이동 */
export function ResetPasswordPage() {
  const next = useNext(), navigate = useNavigate();
  const [email, setEmail] = useState(''), [error, setError] = useState('');
  const authNow = useAuthNow(), s = useStore(), c = s.auth?.challenges[`reset:${normalizeEmail(email)}`], verified = !!c?.verified && c.expiresAt > authNow;
  // 작성 중: 이메일을 적었을 때. 새 비밀번호 화면으로 넘어가는 것은 막지 않는다
  useLeaveGuard(!!email.trim(), { allow: p => p === '/reset-password/new' });
  return (
    <AuthShell title="비밀번호 재설정" onBack={() => navigate(`/login?next=${encodeURIComponent(next)}`)}>
      <h1 className="text-heading font-bold">가입한 이메일을 확인해요.</h1>
      <p className="mb-7 mt-2 text-body text-muted">인증이 끝나면 새 비밀번호를 설정할 수 있어요.</p>
      <div className="space-y-6">
        <EmailVerification email={email} setEmail={setEmail} purpose="reset" onError={setError}/>
        <ErrorBox message={error}/>
        <Button className="w-full" disabled={!verified} onClick={() => navigate(`/reset-password/new?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`)}>비밀번호 변경하기</Button>
        <p className="text-center text-footnote text-muted">가입하지 않은 이메일이면 인증번호가 발송되지 않아요.</p>
      </div>
    </AuthShell>
  );
}

/** 비밀번호 재설정 2단계: 새 비밀번호 입력 */
export function ResetPasswordNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const email = params.get('email') || '', next = safeNext(params.get('next'));
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const authNow = useAuthNow(), s = useStore(), c = s.auth?.challenges[`reset:${normalizeEmail(email)}`], verified = !!c?.verified && c.expiresAt > authNow;
  // 작성 중: 바꾸기 전에 새 비밀번호나 확인을 적었을 때(바꾼 뒤에는 막지 않는다)
  useLeaveGuard(!done && (!!password || !!confirmation));
  if (!email) return <Navigate to="/reset-password" replace/>;
  if (!verified) return <Navigate to={`/reset-password?next=${encodeURIComponent(next)}`} replace/>;
  return (
    <AuthShell title="비밀번호 재설정" onBack={() => navigate(-1)}>
      {done ? (
        <div className="space-y-6">
          <Check size={30}/>
          <h1 className="text-heading-lg font-bold">비밀번호가 변경됐어요.</h1>
          <p className="muted text-label">새 비밀번호로 다시 로그인해 주세요.</p>
          <Button className="w-full" to={`/login?next=${encodeURIComponent(next)}`}>로그인으로</Button>
        </div>
      ) : (
        <form className="space-y-6" onSubmit={async e => { e.preventDefault(); if (busy) return; setError(''); if (password !== confirmation) return setError('비밀번호가 일치하지 않습니다.'); setBusy(true); try { await resetPassword(email, password); setDone(true); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
          <h1 className="text-heading font-bold">새 비밀번호를 설정해 주세요</h1>
          <p className="text-body text-muted">변경이 끝나면 로그인 화면으로 이동해요.</p>
          <PasswordField label="새 비밀번호" value={password} onChange={setPassword}/>
          {password && <div className="flex gap-4 text-label font-bold">
            <span className={password.length >= 8 && password.length <= 64 ? 'text-green' : 'text-muted'} style={{display:'flex',alignItems:'center',gap:4}}><Check size={13} strokeWidth={2}/>8~64자</span>
            <span className={/[a-zA-Z]/.test(password) && /\d/.test(password) && /[^a-zA-Z0-9]/.test(password) ? 'text-green' : 'text-muted'} style={{display:'flex',alignItems:'center',gap:4}}><Check size={13} strokeWidth={2}/>영문·숫자·특수문자</span>
          </div>}
          <PasswordField label="새 비밀번호 확인" value={confirmation} onChange={setConfirmation}/>
          {confirmation && confirmation === password && <p className="text-label text-green">비밀번호가 일치해요.</p>}
          {confirmation && confirmation !== password && <p className="text-footnote text-red">비밀번호가 일치하지 않아요.</p>}
          <ErrorBox message={error}/>
          <Button type="submit" className="w-full" disabled={busy || !validPassword(password) || password !== confirmation}>{busy ? '변경 중…' : '비밀번호 변경하기'}</Button>
        </form>
      )}
    </AuthShell>
  );
}
/** 마이페이지(구매자·판매자)에서 여는 알림 설정 — 가입 단계 화면을 설정 모드로 연다(건너뛰기·진행 막대 없음, 저장 후 돌아감) */
export const SETTINGS_HREF = (back: string) => `/notifications/settings?mode=settings&next=${encodeURIComponent(back)}`;
export function NotificationSettingsPage() {
  const navigate = useNavigate(); const [params] = useSearchParams(); const next = safeNext(params.get('next')); const settingsMode = params.get('mode') === 'settings';
  const [saving, setSaving] = useState(false);
  const NOTIFS = [{ id: 'sale_start', title: '상품 알림', desc: '알림 받기를 누른 상품의 판매 시작·가격 인하·수량 임박을 알려드려요. 끄면 신청한 상품 알림도 오지 않아요' }, { id: 'recommendation', title: '관심 상품 알림을 위한 조회 기록 분석', desc: '상품 조회 기록을 Google Analytics로 분석해, 관심 있을 만한 새 상품을 알려드려요' }];
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('stockdrop:notifications') || '{}'); } catch { return {}; } });
  const [marketing, setMarketing] = useState(false); const toast = useToast(); const s = useStore();
  // 맞춤 상품 알림 토글(recommendation) = 분석 참여 + personalizedRecommendation. 화면을 열 때의 서버 값과 표시값을 기억해 저장 때 바뀐 경우만 반영한다
  const server = useRef({ recommend: false, shown: false });
  // 알림을 켜는 순간(사용자 동작 안) 권한을 묻는다. iOS는 이때만 팝업을 띄우고, 한 번 거절하면 기기 설정에서만 바꿀 수 있다
  const asked = useRef<Promise<NotificationPermission> | null>(null);
  // 이 기기의 백그라운드 알림 상태. 아이폰 설정에서 끄고 돌아오는 경우가 있어 화면을 열 때와 앱으로 돌아올 때마다 다시 확인한다
  const [push, setPush] = useState<PushState>('unsupported');
  // 늦게 끝난 예전 조회가 최신 결과(예: 설정에서 끔)를 덮지 않게 마지막 조회만 반영한다
  const pushCheck = useRef(0);
  const refreshPush = () => { if (USE_MOCK) return; const n = ++pushCheck.current; void pushState().then(v => { if (n === pushCheck.current) setPush(v); }).catch(() => {}); };
  useEffect(() => {
    refreshPush();
    const onBack = () => { if (document.visibilityState === 'visible') refreshPush(); };
    document.addEventListener('visibilitychange', onBack); window.addEventListener('focus', onBack);
    return () => { document.removeEventListener('visibilitychange', onBack); window.removeEventListener('focus', onBack); };
  }, []);
  const askPermission = () => {
    if (USE_MOCK) return null;
    const p = asked.current ?? requestPushPermission();
    // 진행 중인 요청만 공유한다. 끝나면 비워서 설정에서 바꾸고 돌아온 뒤에는 현재 권한을 다시 본다
    if (p) { asked.current = p; const done = () => { if (asked.current === p) asked.current = null; refreshPush(); }; p.then(done, done); }
    else if (pushPermission() === 'denied') toast(PUSH_DENIED_TEXT);
    return p;
  };
  const toggle = (id: string) => { const on = !enabled[id]; setEnabled(e => ({ ...e, [id]: on })); if (on) askPermission(); };
  const pushReady = USE_MOCK || canSubscribePush(); // mock은 기존 화면 그대로. 실제 모드는 홈 화면에 추가된 iOS 앱에서만 구독 버튼
  // 알림 설정 조회 전용 API가 없어 GET /accounts/me로 읽는다. 가격 인하·수량 임박은 상품별 알림 신청(productAlerts.ts)에 포함되고, 이 설정(saleStart)이 전체 스위치다
  const logged = !USE_MOCK && signedIn(s);
  // 로그인 상태면 현재 설정을 다 받은 뒤에만 바꾸고 저장한다. 받기 전·실패 시 저장하면 광고 동의 철회·상품 알림 꺼짐으로 덮어쓴다
  const [load, setLoad] = useState<'loading' | 'ready' | 'failed'>(() => (logged ? 'loading' : 'ready'));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!logged) { setLoad('ready'); return; }
    let alive = true; setLoad('loading');
    Promise.all([fetchMySettings(), syncAnalyticsIdentity().catch(() => null)]).then(([m, id]) => {
      if (!alive) return;
      const shown = recommendationOn(!!id, m.personalizedRecommendation); server.current = { recommend: m.personalizedRecommendation, shown };
      setEnabled(e => ({ ...e, sale_start: m.saleStart, recommendation: shown })); setMarketing(m.marketing); setLoad('ready');
    }).catch(() => { if (alive) setLoad('failed'); });
    return () => { alive = false; };
  }, [logged, attempt]);
  const ready = load === 'ready';
  const [pushBusy, setPushBusy] = useState(false);
  /** 백그라운드 알림만 다시 연결한다(설정 저장 없이). 권한은 클릭 순간 먼저 묻는다 */
  const connectPush = async () => {
    const early = askPermission(); setPushBusy(true);
    try { const r = await enablePush(early); if (r === 'granted') toast('백그라운드 알림을 연결했어요.'); else if (r === 'denied') toast(PUSH_DENIED_TEXT); else if (r === 'disabled') toast('지금은 알림을 연결할 수 없어요. 잠시 후 다시 시도해 주세요.'); }
    catch (e) { toast(`알림을 연결하지 못했어요. ${errorMessage(e)}`); }
    finally { setPushBusy(false); refreshPush(); }
  };
  const proceed = async (push = false) => {
    // 서버 저장(await)보다 먼저 권한을 물어야 iOS가 팝업을 띄운다
    const early = push ? askPermission() : null;
    // 설정을 받지 못한 채 건너뛰면 저장하지 않고 다음 화면으로만 간다
    if (!ready) { navigate(next, { replace: true }); return; }
    setSaving(true); try { await save(push, early); } finally { setSaving(false); }
  };
  const save = async (push: boolean, early: Promise<NotificationPermission> | null = null) => {
    try { localStorage.setItem('stockdrop:notifications', JSON.stringify({ ...enabled, marketing })); } catch {}
    if (!USE_MOCK) {
      // personalizedRecommendation은 분석 참여와 함께 아래에서 바꾼다(여기서는 서버 값 그대로)
      setPendingPrefs({ sale: !!enabled['sale_start'], recommend: server.current.recommend, marketing });
      if (!logged || !(await ensureSession())) { toast('로그인한 뒤 알림 설정을 저장할게요.'); navigate(loginHref(`/notifications/settings?next=${encodeURIComponent(next)}`), { replace: true }); return; }
      if (!(await flushPendingPrefs())) { toast('알림 설정을 저장하지 못했어요. 다시 시도해 주세요.'); return; }
      const on = !!enabled['recommendation'];
      if (on !== server.current.shown) {
        try { await applyRecommendation(on, server.current.recommend, { saveRecommend: v => saveNotificationSettings(!!enabled['sale_start'], v), enroll: enrollAnalytics, withdraw: withdrawAnalytics }); server.current = { recommend: on, shown: on }; }
        catch (e) { setEnabled(x => ({ ...x, recommendation: server.current.shown })); toast(`맞춤 상품 알림을 바꾸지 못했어요. ${errorMessage(e)}`); return; }
      }
    }
    // 서버 Web Push 구독은 '알림 받기 시작'(사용자 동작)에서만. 실패해도 설정 저장은 끝났으니 다음 화면으로 간다
    if (push && logged) { try { const r = await enablePush(early); refreshPush(); if (r === 'denied') toast(PUSH_DENIED_TEXT); else if (r === 'unsupported') toast('이 브라우저는 푸시 알림을 지원하지 않아요. iPhone은 홈 화면에 추가한 뒤 이용해 주세요.'); } catch (e) { toast(errorMessage(e)); } }
    if (settingsMode) toast('알림 설정을 저장했어요.');
    navigate(next, { replace: true });
  };
  return <div className="flex min-h-[calc(100dvh-60px)] flex-col">
    {settingsMode ? <Header title="알림 설정"/> : <>
    <header className="flex items-center justify-between py-3">
      <button className="press -ml-3 grid h-11 w-11 place-items-center" aria-label="이전 화면" onClick={() => navigate(-1)}><Icon name="Back" size={24}/></button>
      <span className="text-title-sm font-bold">알림 설정</span>
      <button className="muted py-2 text-body" onClick={() => proceed()}>건너뛰기</button>
    </header>
    <div className="mb-1 h-[3px] w-full bg-line"><div className="h-[3px] w-full rounded-r-full bg-ink"/></div>
    <div className="flex justify-end py-2 text-footnote text-muted"><span className="font-bold text-text">1</span><span> / 1</span></div></>}
    <div className="flex-1 space-y-5 pt-2">
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-line"><Bell size={22} strokeWidth={1.5}/></div>
        <h1 className="text-headline font-bold">나에게 딱 맞는 알림을 받아보세요</h1>
        <p className="text-center text-label text-muted">구매 이력을 분석해 꼭 필요한 판매 알림만 보내드려요.</p>
      </div>
      <div className="h-[1px] bg-line"/>
      {load === 'loading' && <p role="status" className="muted text-center text-label">현재 알림 설정을 불러오고 있어요.</p>}
      {load === 'failed' && <div role="alert" className="space-y-2 rounded-element bg-soft p-3.5 text-center"><p className="text-body font-bold">알림 설정을 불러오지 못했어요.</p><p className="muted text-label">지금 설정이 바뀌지 않도록 저장을 잠시 막아 두었어요. 다시 시도해 주세요.</p><Button outline className="w-full text-body!" onClick={() => setAttempt(n => n + 1)}>다시 시도</Button></div>}
      <div>{NOTIFS.map(n => <div key={n.id} className="divider flex items-center justify-between gap-4 py-4">
        <div className="flex-1"><p className="text-callout font-bold">{n.title}</p><p className="muted mt-0.5 text-label">{n.desc}</p></div>
        <button role="switch" aria-label={n.title} aria-checked={!!enabled[n.id]} disabled={!ready} onClick={() => toggle(n.id)} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${enabled[n.id] ? 'bg-ink' : 'bg-line'}`}><span className={`absolute top-[3px] h-5.5 w-5.5 rounded-full bg-white shadow-sm transition-all ${enabled[n.id] ? 'left-[23px]' : 'left-[3px]'}`}/></button>
      </div>)}</div>
      <div className="h-[1px] bg-line"/>
      <label className="flex items-start gap-3 rounded-element bg-infobar p-4 text-body font-bold">
        <input type="checkbox" checked={marketing} disabled={!ready} onChange={e => setMarketing(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded-inner"/>
        <div><p>광고성 정보 수신 동의 (선택)</p><p className="muted mt-1 text-footnote font-normal leading-relaxed">개인 맞춤 알림 서비스를 위해 마케팅 정보 수신에 동의합니다.</p></div>
      </label>
      <p className="muted text-label">맞춤 알림을 받으려면 위 두 가지 모두 동의가 필요해요</p>
      {logged && push === 'denied' && <Note title="백그라운드 알림이 꺼져 있어요"><p>{PUSH_DENIED_TEXT} 켠 뒤 이 화면으로 돌아오면 다시 연결할 수 있어요.</p></Note>}
      {logged && (push === 'ask' || push === 'reconnect') && <div role="status" className="space-y-2 rounded-element bg-soft p-4">
        <p className="text-body font-bold">백그라운드 알림이 연결되어 있지 않아요</p>
        <p className="text-label text-aux">앱을 닫아도 알림을 받으려면 알림을 허용해 주세요. 앱 안 알림함은 그대로 받을 수 있어요.</p>
        <Button outline className="w-full text-body!" disabled={pushBusy} onClick={connectPush}>{pushBusy ? '연결 중…' : push === 'ask' ? '알림 허용하기' : '백그라운드 알림 다시 연결'}</Button>
      </div>}
      {!pushReady && <Note title="푸시 알림"><p>홈 화면에 추가하면 알림을 받을 수 있어요. 사파리 공유 버튼 → ‘홈 화면에 추가’ 후 홈 화면의 STOCKDROP 앱으로 열어 주세요.</p></Note>}
      {PUSH_DEBUG && <PushDebug/>}
    </div>
    <div className="pb-6 pt-4"><Button className="w-full" disabled={saving || !ready} onClick={() => proceed(pushReady)}>{settingsMode ? (saving ? '저장 중…' : '저장') : pushReady ? '알림 받기 시작' : '설정 저장하고 시작'}</Button></div>
  </div>;
}
export function LogoutButton() { const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), navigate = useNavigate(), toast = useToast(); return <><button className="muted py-4 text-label underline underline-offset-4" onClick={() => setOpen(true)}>로그아웃</button>{open && <Modal title="로그아웃할까요?" onClose={() => setOpen(false)} restoreOnUnmount={!busy}><Note>주문과 신청 내역은 유지됩니다. 진행 중인 재고 확보 시간은 로그아웃해도 멈추거나 연장되지 않습니다.</Note><div className="mt-6 flex gap-3"><Button outline className="flex-1" closeSheet>취소</Button><Button className="flex-1" disabled={busy} onClick={async () => { setBusy(true); await logout(); navigate('/', { replace: true }); toast('로그아웃했습니다.'); }}>로그아웃하기</Button></div></Modal>}</>; }
