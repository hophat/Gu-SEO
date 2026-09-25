// Shared engine for the video_jobs queue.
//
// The Video page and the Carousel page are two views of the SAME queue:
// both load /api/admin/video/list, both publish and delete a job, and both
// label the same statuses. That knowledge lives here; the pages keep only
// their presentation and their own create flows.
import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { apiGet, apiPost } from '../api.js';

export const CAROUSEL_KIND = 'carousel';
export const EXPLAINER_KIND = 'explainer';
export const IN_PROGRESS = ['pending', 'claimed', 'rendering'];

const VIDEO_STATUS_META = {
  pending:   { color: 'default',    text: 'Chờ render' },
  claimed:   { color: 'processing', text: 'Đang render' },
  rendering: { color: 'processing', text: 'Đang render' },
  done:      { color: 'success',    text: 'Đã có video' },
  failed:    { color: 'error',      text: 'Lỗi render' },
};

const CAROUSEL_STATUS_META = {
  pending:   { color: 'default',    text: 'Chờ tạo slide' },
  claimed:   { color: 'processing', text: 'Đang tạo slide' },
  rendering: { color: 'processing', text: 'Đang tạo slide' },
  done:      { color: 'success',    text: 'Sẵn sàng đăng' },
  failed:    { color: 'error',      text: 'Lỗi' },
};

// Status label depends on the job kind — a carousel generates slides, a
// video renders an MP4, so "done" reads differently for each. An
// explainer is a video (it delivers an MP4), so it shares VIDEO_STATUS_META.
export function statusMeta(kind, status) {
  const table = kind === CAROUSEL_KIND ? CAROUSEL_STATUS_META : VIDEO_STATUS_META;
  return table[status] || { color: 'default', text: status };
}

export function fmtDateTime(sec) {
  if (!sec) return '—';
  return new Date(sec * 1000).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

// Owns the queue's data and the two row actions. `noun` only shapes copy
// ("video" / "carousel"); the endpoints are the same. `poll` opts into the
// 20s auto-refresh while a job is still rendering.
export function useVideoJobs({ noun = 'video', poll = true } = {}) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/video/list');
    if (status === 200 && body?.ok) setJobs(body.jobs || []);
    else message.error(body?.error || 'Không tải được danh sách');
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // The agent works off-platform within a ~5 minute cycle — poll while
  // anything is still cooking so the operator need not refresh by hand.
  useEffect(() => {
    if (!poll || !jobs.some((j) => IN_PROGRESS.includes(j.status))) return;
    const t = setInterval(reload, 20000);
    return () => clearInterval(t);
  }, [poll, jobs, reload]);

  const publish = useCallback(async (id, channel = 'facebook') => {
    const target = channel === 'youtube' || channel === 'youtube_video' ? 'youtube' : 'facebook';
    const label = target === 'youtube' ? 'YouTube' : 'Facebook';
    const { status, body } = await apiPost('/api/admin/video/publish', { id, channel: target });
    if (status === 200 && body?.ok) {
      message.success(body.posted ? `Đã đăng ${noun} lên ${label}` : `Đã vào hàng chờ ${label} — cron sẽ xử lý`);
      await reload();
      return true;
    }
    message.error(body?.error === 'already_enqueued'
      ? 'Bài này đang được đăng — xem tab Bài đăng mạng xã hội'
      : body?.error || 'Đăng thất bại');
    return false;
  }, [noun, reload]);

  const remove = useCallback(async (id) => {
    const { status, body } = await apiPost('/api/admin/video/delete', { id });
    if (status === 200 && body?.ok) {
      message.success(`Đã xóa ${noun} (cả tệp trên R2)`);
      await reload();
      return true;
    }
    message.error(body?.detail || body?.error || 'Xóa thất bại');
    return false;
  }, [noun, reload]);

  return { jobs, loading, reload, publish, remove };
}
