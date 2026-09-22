// Background-music catalog — the platform owns the library, the agent owns
// the mix. The admin wizard lists these tracks (with an in-browser preview),
// stores the picked id on video_jobs.bgm, and the claim hands the agent a
// playable URL. Three stored shapes:
//   NULL    → 'auto' — the agent synthesises its ambient pad (default)
//   'none'  → muted by operator choice — voice only
//   <id>    → a track below; the agent fetches music/<id>.mp3 from R2,
//             trims it to the video length and fades it under the voice
//
// Tracks are Mixkit free stock music (https://mixkit.co/license/): free for
// commercial use in videos, no attribution required. Files live in R2 under
// music/<file> and stream publicly via /image/music/<file> — the wizard's
// preview player and the VPS agent both read the same URL, so a track that
// previews is a track that can render. Never accept a user-supplied URL in
// place of an id: the catalog is the allow-list.

export const BGM_LICENSE = {
  label: 'Mixkit Free License',
  url: 'https://mixkit.co/license/',
  attribution: false,
};

export const BGM_TRACKS = [
  { id: 'driving-ambition', label: 'Driving Ambition', artist: 'Ahjay Stelino', mood: 'Hào hứng', desc: 'Nhạc nền tích cực, hợp ra mắt & tin tức', duration: '1:42', file: 'driving-ambition.mp3' },
  { id: 'sports-highlights', label: 'Sports Highlights', artist: 'Ahjay Stelino', mood: 'Sôi động', desc: 'Năng lượng cao, nhịp nhanh kiểu bản tin', duration: '1:36', file: 'sports-highlights.mp3' },
  { id: 'deep-urban', label: 'Deep Urban', artist: 'Eugenio Mininni', mood: 'Công nghệ', desc: 'Tech house, hợp giới thiệu sản phẩm/app', duration: '4:49', file: 'deep-urban.mp3' },
  { id: 'hazy-after-hours', label: 'Hazy After Hours', artist: 'Alejandro Magaña', mood: 'Thư giãn', desc: 'Electronica mềm, phong cách hiện đại', duration: '2:07', file: 'hazy-after-hours.mp3' },
  { id: 'serene-view', label: 'Serene View', artist: 'Arulo', mood: 'Nhẹ nhàng', desc: 'Chillout êm, hợp tóm tắt & hỏi đáp', duration: '1:54', file: 'serene-view.mp3' },
  { id: 'valley-sunset', label: 'Valley Sunset', artist: 'Alejandro Magaña', mood: 'Trầm ấm', desc: 'Ambient bầu không khí, kể chuyện sâu', duration: '2:14', file: 'valley-sunset.mp3' },
  { id: 'silent-descent', label: 'Silent Descent', artist: 'Eugenio Mininni', mood: 'Điện ảnh', desc: 'Piano + strings cảm xúc, hợp story', duration: '2:40', file: 'silent-descent.mp3' },
  { id: 'beautiful-dream', label: 'Beautiful Dream', artist: 'Diego Nava', mood: 'Ấm áp', desc: 'Guitar mộc, hợp review & doanh nghiệp địa phương', duration: '1:37', file: 'beautiful-dream.mp3' },
  { id: 'gimme-groove', label: 'Gimme that Groove!', artist: 'Michael Ramir C.', mood: 'Vui nhộn', desc: 'Funk tươi vui, hợp listicle & tips', duration: '1:28', file: 'gimme-groove.mp3' },
  { id: 'island-beat', label: 'Island Beat', artist: 'Arulo', mood: 'Nhiệt đới', desc: 'Beat du lịch/quán cà phê, tươi sáng', duration: '1:42', file: 'island-beat.mp3' },
];

export const BGM_NONE = 'none';

export function bgmTrackById(id) {
  return BGM_TRACKS.find((t) => t.id === id) || null;
}

// Public path a track streams from — the same URL previews in the wizard
// and downloads on the VPS. Relative on purpose: the admin UI is same-
// origin, and the claim absolutizes it for the off-platform agent.
export function bgmTrackPath(track) {
  return `/image/music/${track.file}`;
}

// Request param → stored value. 'auto'/absent stores NULL (the pad), 'none'
// stores the mute sentinel, anything else must be a catalog id.
export function parseBgmParam(raw) {
  const v = String(raw ?? '').trim();
  if (!v || v === 'auto') return { ok: true, bgm: null };
  if (v === BGM_NONE) return { ok: true, bgm: BGM_NONE };
  if (bgmTrackById(v)) return { ok: true, bgm: v };
  return { ok: false };
}
