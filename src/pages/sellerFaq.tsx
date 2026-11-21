/**
 * 판매 중 상품 FAQ 수정(/seller/product/:id/faqs, 실제 모드). 승인된 상품도 심사 없이 FAQ만 하나씩 추가, 수정, 삭제한다.
 * 서버 규칙과 반영 확인은 src/faqEdit.ts
 */
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Faq, Product } from '../domain';
import { activeUser } from '../domain';
import { mutate, useStore } from '../store';
import { addProductFaq, deleteProductFaq, errorMessage, getProduct, getSellerProduct, isApiError, mergeProducts, updateProductFaq, useApi } from '../api';
import { Button, ErrorBox, Header, LiveStatus, Note, Unavailable, useToast } from '../components/ui';
import { USE_MOCK } from '../config';
import { FAQ_ANSWER_MAX, FAQ_QUESTION_MAX, faqProblem, waitForPublicFaqs } from '../faqEdit';

type Sync = 'idle' | 'checking' | 'done' | 'late';
export function SellerFaqPage() {
  const { id } = useParams(); const s = useStore(), user = activeUser(s), toast = useToast();
  const loaded = useApi(signal => (USE_MOCK || !id || !user.seller ? Promise.resolve(null) : getSellerProduct(id, signal)), [id, user.id]);
  const [product, setProduct] = useState<Product | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // null=닫힘, ''=새 FAQ, 그 밖=수정 중인 FAQ id
  const [question, setQuestion] = useState(''), [answer, setAnswer] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Faq | null>(null), [sync, setSync] = useState<Sync>('idle');
  const check = useRef<AbortController | null>(null);
  useEffect(() => { if (loaded.data) setProduct(loaded.data); }, [loaded.data]);
  useEffect(() => () => check.current?.abort(), []);
  if (USE_MOCK) return <div className="space-y-4"><Header title="FAQ 수정"/><Note>실제 서버에 연결된 화면에서만 FAQ를 수정할 수 있어요.</Note></div>;
  if (!user.seller) return <Unavailable/>;
  if (!product) return <div className="space-y-4"><Header title="FAQ 수정"/><LiveStatus state={loaded}/></div>;
  const p = product, inReview = p.reviewStatus === 'IN_REVIEW';

  /** 서버 응답(새 version)을 반영하고, 공개 상품이면 구매자 상세에 반영됐는지 잠시 확인한다 */
  function applied(next: Product, message: string) {
    setProduct(next); mutate(st => mergeProducts(st, [next])); toast(message);
    check.current?.abort();
    if (next.reviewStatus !== 'APPROVED') { setSync('idle'); return; }
    const c = new AbortController(); check.current = c; setSync('checking');
    waitForPublicFaqs(async () => (await getProduct(next.id, c.signal)).faqs, next.faqs, c.signal).then(ok => setSync(ok ? 'done' : 'late'), () => {});
  }
  /** 다른 곳에서 상품이 바뀌어 version이 다르면(409) 최신 원본을 다시 받는다. 입력 내용은 그대로 둔다 */
  async function failed(e: unknown) {
    if (isApiError(e) && e.status === 409) {
      if (inReview) { setError('판매 심사 중에는 FAQ를 바꿀 수 없어요.'); return; }
      try { const fresh = await getSellerProduct(p.id); setProduct(fresh); setError(fresh.reviewStatus === 'IN_REVIEW' ? '판매 심사 중이라 FAQ를 바꿀 수 없어요.' : '상품 정보가 바뀌어 최신 내용을 불러왔어요. 다시 저장해 주세요.'); }
      catch (again) { setError(errorMessage(again)); }
      return;
    }
    setError(errorMessage(e));
  }
  const open = (f?: Faq) => { setError(''); setEditing(f?.id ?? ''); setQuestion(f?.question ?? ''); setAnswer(f?.answer ?? ''); };
  async function save() {
    const problem = faqProblem(question, answer); setError(problem); if (problem || busy) return;
    setBusy(true);
    try {
      const body = { question: question.trim(), answer: answer.trim() };
      const next = editing ? await updateProductFaq(p.id, editing, p.version ?? 0, { id: editing, ...body, suggestionId: p.faqs.find(f => f.id === editing)?.suggestionId }) : await addProductFaq(p.id, p.version ?? 0, body);
      setEditing(null); setQuestion(''); setAnswer('');
      applied(next, editing ? 'FAQ를 수정했어요.' : 'FAQ를 추가했어요.');
    } catch (e) { await failed(e); } finally { setBusy(false); }
  }
  async function remove(f: Faq) {
    setBusy(true); setError('');
    try { const next = await deleteProductFaq(p.id, f.id, p.version ?? 0); setRemoving(null); if (editing === f.id) setEditing(null); applied(next, 'FAQ를 삭제했어요.'); }
    catch (e) { setRemoving(null); await failed(e); } finally { setBusy(false); }
  }
  const form = <section className="space-y-3 rounded-element border border-line p-4" aria-label={editing ? 'FAQ 수정' : '새 FAQ'}>
    <p className="text-body font-bold">{editing ? 'FAQ 수정' : '새 FAQ'}</p>
    <label className="block space-y-1"><span className="label">질문</span><textarea aria-label="FAQ 질문" className="field field-box w-full" rows={2} maxLength={FAQ_QUESTION_MAX} value={question} onChange={e => setQuestion(e.target.value)} placeholder="구매자가 자주 묻는 질문"/></label>
    <label className="block space-y-1"><span className="label">답변</span><textarea aria-label="FAQ 답변" className="field field-box w-full" rows={4} maxLength={FAQ_ANSWER_MAX} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="공개해도 되는 답변"/><span className="muted block text-right text-footnote">{answer.length.toLocaleString('ko-KR')} / {FAQ_ANSWER_MAX.toLocaleString('ko-KR')}</span></label>
    <div className="flex gap-2"><Button outline className="w-21.5" disabled={busy} onClick={() => { setEditing(null); setError(''); }}>취소</Button><Button className="flex-1" disabled={busy} onClick={save}>{busy ? '저장 중…' : editing ? '수정 저장' : 'FAQ 추가'}</Button></div>
  </section>;
  return <div className="space-y-5">
    <Header title="FAQ 수정" subtitle={p.name}/>
    <Note>FAQ는 상품 상세의 '자주 묻는 질문'에 바로 공개돼요. 판매 중인 상품도 다시 심사받지 않고 바꿀 수 있어요.</Note>
    {inReview && <Note title="판매 심사 중이에요">심사가 끝나면 FAQ를 바꿀 수 있어요.</Note>}
    {sync !== 'idle' && <p role="status" className="text-label text-meta">{sync === 'checking' ? '구매자 화면에 반영되는지 확인하고 있어요…' : sync === 'done' ? '구매자 상품 상세에 반영됐어요.' : '구매자 화면에는 잠시 뒤 반영돼요.'}</p>}
    <section className="space-y-2" aria-label="등록된 FAQ">
      <h2 className="text-subhead font-bold">등록된 FAQ {p.faqs.length}개</h2>
      {p.faqs.map(f => <article key={f.id} className="space-y-2 rounded-element bg-soft p-4">
        <p className="whitespace-pre-line text-body font-bold">Q. {f.question}</p>
        <p className="whitespace-pre-line text-label leading-relaxed text-aux">{f.answer}</p>
        {!inReview && <div className="flex justify-end gap-3 text-label"><button type="button" className="font-bold underline" aria-label={`${f.question} 수정`} onClick={() => open(f)}>수정</button><button type="button" className="font-bold text-red underline" aria-label={`${f.question} 삭제`} onClick={() => setRemoving(f)}>삭제</button></div>}
      </article>)}
      {!p.faqs.length && <p className="muted py-2 text-label">아직 등록된 FAQ가 없어요.</p>}
    </section>
    <ErrorBox message={error}/>
    {!inReview && (editing !== null ? form : <Button outline className="w-full" onClick={() => open()}>FAQ 추가</Button>)}
    {removing && <div className="fixed inset-0 z-50 flex items-end bg-black/60" role="dialog" aria-label="FAQ 삭제 확인">
      <div className="mx-auto w-full max-w-[390px] rounded-t-container bg-white px-4 pb-8 pt-2">
        <div className="mx-auto mb-4 h-1 w-8 rounded-full bg-border"/>
        <h2 className="mb-1 text-title font-bold">FAQ를 삭제할까요?</h2>
        <p className="mb-5 line-clamp-2 text-body text-aux">{removing.question}</p>
        <div className="flex gap-2"><Button outline className="w-21.5" disabled={busy} onClick={() => setRemoving(null)}>취소</Button><Button className="flex-1" disabled={busy} onClick={() => remove(removing)}>{busy ? '삭제 중…' : '삭제하기'}</Button></div>
      </div>
    </div>}
  </div>;
}
