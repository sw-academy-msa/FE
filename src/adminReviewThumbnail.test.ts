import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminProductImageUrl, listAdminProductImages } from './api/admin';
import { adminReviewThumbnail, invalidateAdminReviewThumbnails } from './adminReviewThumbnail';

vi.mock('./api/admin', () => ({ listAdminProductImages: vi.fn(), getAdminProductImageUrl: vi.fn() }));
const images = vi.mocked(listAdminProductImages), download = vi.mocked(getAdminProductImageUrl);

beforeEach(() => vi.resetAllMocks());

describe('운영자 심사 목록 썸네일', () => {
  it('메타의 position 첫 사진만 발급하고 중복 요청과 계정 캐시를 구분한다', async () => {
    images.mockResolvedValue([{ id: 'second', position: 2 }, { id: 'first', position: 0 }] as never);
    download.mockResolvedValue('first-url');
    const first = adminReviewThumbnail('admin-a', 'sorted', 0);
    expect(adminReviewThumbnail('admin-a', 'sorted', 1)).toBe(first);
    expect(await first).toBe('first-url');
    expect(download).toHaveBeenCalledExactlyOnceWith('sorted', 'first');
    await adminReviewThumbnail('admin-b', 'sorted', 1);
    expect(images).toHaveBeenCalledTimes(2);
  });

  it('사진 없음, 메타 실패, URL 실패는 빈 칸으로 끝난다', async () => {
    images.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('metadata'))
      .mockResolvedValueOnce([{ id: 'image', position: 0 }] as never);
    download.mockRejectedValueOnce(new Error('download'));
    expect(await adminReviewThumbnail('admin', 'empty', 0)).toBe('');
    expect(await adminReviewThumbnail('admin', 'meta-error', 0)).toBe('');
    expect(await adminReviewThumbnail('admin', 'url-error', 0)).toBe('');
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('캐시 유효시간과 만료 이벤트 이후 새 URL을 발급하며 중복 이벤트는 합친다', async () => {
    images.mockResolvedValue([{ id: 'image', position: 0 }] as never);
    download.mockResolvedValueOnce('old').mockResolvedValueOnce('ttl').mockResolvedValueOnce('renewed');
    expect(await adminReviewThumbnail('admin', 'expiry', 0)).toBe('old');
    expect(await adminReviewThumbnail('admin', 'expiry', 300_000)).toBe('ttl');
    invalidateAdminReviewThumbnails(300_000);
    expect(await adminReviewThumbnail('admin', 'expiry', 300_001)).toBe('renewed');
    invalidateAdminReviewThumbnails(300_002);
    expect(await adminReviewThumbnail('admin', 'expiry', 300_003)).toBe('renewed');
    expect(download).toHaveBeenCalledTimes(3);
  });
});
