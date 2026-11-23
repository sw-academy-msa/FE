import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'onCompositionStart' | 'onCompositionEnd'> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** 표시값은 즉시 유지하고 조합 완료 후 검색이나 저장에 반영한다. */
export function CompositionInput({ value, onValueChange, ...props }: Props) {
  const [text, setText] = useState(value);
  const composing = useRef(false), committed = useRef(value), pending = useRef<string[]>([]);
  useEffect(() => {
    if (composing.current) return;
    // URL 갱신이 늦게 돌아와도 이전 검색어가 최신 입력을 덮지 않게 한다.
    if (pending.current.includes(value) && value !== pending.current.at(-1)) return;
    pending.current = []; committed.current = value; setText(value);
  }, [value]);
  const commit = (next: string) => {
    // compositionend 직후 같은 값의 input 이벤트가 와도 한 번만 반영한다.
    if (next === committed.current) return;
    committed.current = next; pending.current.push(next); onValueChange(next);
  };
  return <input {...props} value={text}
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={event => { composing.current = false; const next = event.currentTarget.value; setText(next); commit(next); }}
    onChange={event => { const next = event.currentTarget.value; setText(next); if (!composing.current && !(event.nativeEvent as InputEvent).isComposing) commit(next); }}
    // 칸을 벗어나면(다른 화면으로 바로 가기 전 등) 조합 중이던 글자까지 반영한다
    onBlur={event => { composing.current = false; commit(event.currentTarget.value); props.onBlur?.(event); }}/>;
}
