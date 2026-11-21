/**
 * 관심사와 맞춤 추천 프로필(/my/interests, 실제 모드).
 * - 관심 카테고리: GET /signup-options 선택지, GET /accounts/me의 interestCategories, PUT /accounts/me/interests(전체 교체, 최대 12개)
 * - 맞춤 추천 프로필: GET /ai/analytics/profile(BUYER). 분석 참여 전이면 analyticsEnabled=false(또는 404)라 참여 방법을 안내한다
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MAX_INTERESTS, errorMessage, fetchAnalyticsProfile, fetchMyInterests, fetchSignupOptions, saveInterests, useApi } from '../api';
import { profileView } from '../sellerFlows';
import { Button, Chip, ErrorBox, Header, LiveStatus, Note, useToast } from '../components/ui';
import { kstDay } from '../hooks';
import { USE_MOCK } from '../config';
import { SETTINGS_HREF } from './auth';

export function InterestsPage() {
  const toast = useToast();
  const options = useApi(signal => (USE_MOCK ? Promise.resolve(null) : fetchSignupOptions(signal)), []);
  const mine = useApi(signal => (USE_MOCK ? Promise.resolve([] as string[]) : fetchMyInterests(signal)), []);
  const profile = useApi(signal => (USE_MOCK ? Promise.resolve(null) : fetchAnalyticsProfile(signal)), []);
  const [picked, setPicked] = useState<string[]>([]), [saved, setSaved] = useState<string[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { if (mine.data) { setPicked(mine.data); setSaved(mine.data); } }, [mine.data]);
  if (USE_MOCK) return <div className="space-y-4"><Header title="관심사와 맞춤 추천"/><Note>실제 서버에 연결된 화면에서만 관심사를 저장하고 맞춤 추천 프로필을 볼 수 있어요.</Note></div>;
  const dirty = picked.length !== saved.length || picked.some(c => !saved.includes(c));
  const toggle = (code: string) => {
    setError('');
    if (picked.includes(code)) setPicked(picked.filter(c => c !== code));
    else if (picked.length >= MAX_INTERESTS) setError(`관심 카테고리는 ${MAX_INTERESTS}개까지 고를 수 있어요.`);
    else setPicked([...picked, code]);
  };
  async function save() {
    setBusy(true); setError('');
    try { await saveInterests(picked); setSaved(picked); toast(picked.length ? '관심 카테고리를 저장했어요.' : '관심 카테고리를 모두 해제했어요.'); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  const view = profile.data && profileView(profile.data);
  return <div className="space-y-6">
    <Header title="관심사와 맞춤 추천" subtitle="관심 카테고리를 고르면 맞춤 추천에 반영돼요."/>
    <section className="space-y-3" aria-label="관심 카테고리">
      <div className="flex items-center justify-between"><h2 className="text-subhead font-bold">관심 카테고리</h2><span className="muted text-label">{picked.length} / {MAX_INTERESTS}</span></div>
      {options.data && mine.data ? <div className="flex flex-wrap gap-2">{options.data.categories.map(c => <Chip key={c.code} selected={picked.includes(c.code)} onClick={() => toggle(c.code)}>{c.label}</Chip>)}</div>
        : <LiveStatus state={options.error ? options : mine}/>}
      {options.data && !options.data.categories.length && <p className="muted text-label">고를 수 있는 카테고리가 아직 없어요.</p>}
      <ErrorBox message={error}/>
      <Button className="w-full" disabled={busy || !dirty || !options.data || !mine.data} onClick={save}>{busy ? '저장 중…' : '관심 카테고리 저장'}</Button>
    </section>
    <section className="space-y-3" aria-label="맞춤 추천 프로필">
      <h2 className="text-subhead font-bold">내 맞춤 추천 프로필</h2>
      {!view ? <LiveStatus state={profile}/> : <div role="status" className={`space-y-1 rounded-element p-4 ${view.kind === 'ready' ? 'bg-green-soft' : 'bg-soft'}`}>
        {view.kind === 'ready' && <p className="text-footnote font-bold text-green">가장 관심 있는 카테고리</p>}
        <p className="text-subhead font-bold">{view.title}</p>
        <p className="muted text-label leading-relaxed">{view.body}</p>
        {view.kind === 'ready' && profile.data?.profileAsOf && <p className="muted text-footnote">{kstDay(Date.parse(profile.data.profileAsOf))} 집계 기준</p>}
      </div>}
      {view?.kind === 'off' && <Button outline className="w-full" to={SETTINGS_HREF('/my/interests')}>알림 설정에서 맞춤 상품 알림 켜기</Button>}
    </section>
  </div>;
}
