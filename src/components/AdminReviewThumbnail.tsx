import { useEffect, useRef, useState } from 'react';
import { adminReviewThumbnail, invalidateAdminReviewThumbnails } from '../adminReviewThumbnail';
import { IMAGE_EXPIRED, USE_MOCK } from '../config';
import { ProductImage } from './ui';

export function AdminReviewThumbnail({ accountId, productId, name, mockSrc }: { accountId: string; productId: string; name: string; mockSrc?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [photo, setPhoto] = useState<{ key: string; url: string }>();
  const key = JSON.stringify([accountId, productId]);
  useEffect(() => {
    const node = ref.current;
    if (!node || USE_MOCK) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [key]);
  useEffect(() => {
    if (USE_MOCK || !visible) return;
    let active = true, request = 0;
    const load = () => {
      const current = ++request;
      void adminReviewThumbnail(accountId, productId).then(url => {
        if (active && current === request) setPhoto({ key, url });
      });
    };
    const expired = () => { invalidateAdminReviewThumbnails(); load(); };
    load();
    window.addEventListener(IMAGE_EXPIRED, expired);
    return () => { active = false; window.removeEventListener(IMAGE_EXPIRED, expired); };
  }, [accountId, productId, key, visible]);
  const src = USE_MOCK ? mockSrc : photo?.key === key ? photo.url : '';
  return <span ref={ref} className="h-16 w-16 shrink-0 rounded-inner">
    {src ? <ProductImage src={src} alt={name} className="h-16 w-16 rounded-inner"/> : <span role="img" aria-label={name} data-fallback="blank" className="block h-16 w-16 rounded-inner bg-surface"/>}
  </span>;
}
