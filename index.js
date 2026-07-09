const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 7000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const ARCHIVE_META = 'https://archive.org/metadata';
const ARCHIVE_DL = 'https://archive.org/download';
const ARCHIVE_IMG = 'https://archive.org/services/img';

// ------------------------------------------------------------------
// المكتبة: كل صف (catalog) فيه مجموعات
// ------------------------------------------------------------------
const LIBRARY = [
  {
    catalogId: 'arch-tomjerry',
    catalogName: 'توم وجيري - كلاسيك',
    items: [
      { id: 'tomandjerry-theclassiccollection-volume01', name: 'توم وجيري - الجزء 1' },
      { id: 'tomandjerrytheclassiccollectionvolume03', name: 'توم وجيري - الجزء 3' },
      { id: 'tomandjerrytheclassiccollectionvolume04', name: 'توم وجيري - الجزء 4' },
      { id: 'tomandjerrytheclassiccollectionvolume05', name: 'توم وجيري - الجزء 5' },
      { id: 'tomandjerrytheclassiccollectionvolume06', name: 'توم وجيري - الجزء 6' },
      { id: 'tomandjerrytheclassiccollectionvolume07', name: 'توم وجيري - الجزء 7' },
      { id: 'tomandjerrytheclassiccollectionvolume08', name: 'توم وجيري - الجزء 8' },
      { id: 'tomandjerrytheclassiccollectionvolume09', name: 'توم وجيري - الجزء 9' },
      { id: 'tomandjerrytheclassiccollectionvolume10', name: 'توم وجيري - الجزء 10' }
    ]
  },
  {
    catalogId: 'arch-pinkpanther',
    catalogName: 'النمر الوردي',
    items: [
      { id: 'the-pink-panther', name: 'النمر الوردي - الحلقات القصيرة' },
      { id: 'the-pink-panther-1993-series', name: 'النمر الوردي - مسلسل 1993' },
      { id: 'the-pink-panther-show-the-complete-series-1969-70', name: 'عرض النمر الوردي 1969' }
    ]
  },
  {
    catalogId: 'arch-mrbean',
    catalogName: 'مستر بين',
    items: [
      { id: 'mr-bean-animated-series', name: 'مستر بين - الكرتون' }
    ]
  },
  {
    catalogId: 'arch-conan',
    catalogName: 'المحقق كونان (مدبلج)',
    items: [
      { id: 'anime-detective-conan-season10-arabic-dub', name: 'المحقق كونان - الجزء 10' }
    ]
  }
];

const NAME_BY_ID = {};
LIBRARY.forEach((cat) => {
  cat.items.forEach((it) => {
    NAME_BY_ID[it.id] = it.name;
  });
});

const episodeCache = {};

// يحول الحجم لصيغة مقروءة
function humanSize(bytes) {
  const n = parseInt(bytes, 10);
  if (!n || isNaN(n)) return '';
  if (n > 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  return Math.round(n / (1024 * 1024)) + ' MB';
}

// ------------------------------------------------------------------
// جلب الحلقات: نجمع النسخة الأصلية + النسخة الخفيفة لكل حلقة
// ------------------------------------------------------------------
async function fetchEpisodes(identifier) {
  if (episodeCache[identifier]) return episodeCache[identifier];

  try {
    const res = await axios.get(`${ARCHIVE_META}/${identifier}`, { timeout: 25000 });
    const files = (res.data && res.data.files) || [];

    const groups = {};

    files.forEach((f) => {
      const name = f.name || '';
      const lower = name.toLowerCase();

      const isVideo =
        lower.endsWith('.mp4') || lower.endsWith('.mkv') || lower.endsWith('.avi');
      if (!isVideo) return;

      // نتجاهل التعليقات الصوتية والمصغرات
      if (lower.includes('_thumb') || lower.includes('commentary')) return;

      // النسخة الخفيفة من الأرشيف تنتهي بـ .ia.mp4
      const isLight = lower.endsWith('.ia.mp4');

      // اسم أساسي موحّد للحلقة (بدون الامتداد ولا .ia)
      const base = name
        .replace(/\.ia\.mp4$/i, '')
        .replace(/\.(mp4|mkv|avi)$/i, '');

      if (!groups[base]) {
        groups[base] = { base, original: null, light: null };
      }

      if (isLight) {
        groups[base].light = { fileName: name, size: f.size };
      } else {
        groups[base].original = { fileName: name, size: f.size };
      }
    });

    const episodes = Object.values(groups)
      .filter((g) => g.original || g.light)
      .sort((a, b) => a.base.localeCompare(b.base, 'en', { numeric: true }))
      .map((g) => ({
        identifier,
        title: g.base.replace(/_/g, ' ').trim(),
        original: g.original,
        light: g.light
      }));

    episodeCache[identifier] = episodes;
    console.log(`تم جلب ${episodes.length} حلقة من ${identifier}`);
    return episodes;
  } catch (err) {
    console.error(`خطأ بجلب ${identifier}: ${err.message}`);
    return [];
  }
}

// ------------------------------------------------------------------
// تسخين الكاش: نجهز كل المجموعات بالخلفية عند التشغيل
// ------------------------------------------------------------------
async function warmCache() {
  const all = [];
  LIBRARY.forEach((c) => c.items.forEach((i) => all.push(i.id)));

  for (const id of all) {
    await fetchEpisodes(id);
    await new Promise((r) => setTimeout(r, 400)); // نتنفس بين الطلبات
  }
  console.log('اكتمل تسخين الكاش ✅');
}

const manifest = {
  id: 'com.khalifa.archivetoons',
  version: '4.0.0',
  name: 'Archive Toons - أرشيف خليفة',
  description: 'كرتون كلاسيك وأنمي مدبلج من archive.org',
  logo: 'https://archive.org/images/glogo.png',
  resources: ['catalog', 'meta', 'stream'],
  types: ['series'],
  catalogs: LIBRARY.map((c) => ({
    type: 'series',
    id: c.catalogId,
    name: c.catalogName
  })),
  idPrefixes: ['arch:']
};

app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(manifest);
});

// نقطة بسيطة عشان خدمات "إبقاء السيرفر صاحي" تناديها
app.get('/ping', (req, res) => res.send('ok'));

app.get('/catalog/series/:catalogId.json', (req, res) => {
  const cat = LIBRARY.find((c) => c.catalogId === req.params.catalogId);
  if (!cat) return res.json({ metas: [] });

  const metas = cat.items.map((it) => ({
    id: `arch:${it.id}`,
    type: 'series',
    name: it.name,
    poster: `${ARCHIVE_IMG}/${it.id}`,
    posterShape: 'poster'
  }));

  res.setHeader('Content-Type', 'application/json');
  res.json({ metas });
});

app.get('/meta/series/:id.json', async (req, res) => {
  const identifier = req.params.id.replace('arch:', '');
  const episodes = await fetchEpisodes(identifier);

  if (episodes.length === 0) {
    return res.status(404).json({ err: 'not found' });
  }

  const poster = `${ARCHIVE_IMG}/${identifier}`;
  const seriesName = NAME_BY_ID[identifier] || identifier;

  const videos = episodes.map((ep, i) => ({
    id: `arch:${identifier}:${i}`,
    title: ep.title,
    name: ep.title,
    season: 1,
    episode: i + 1,
    thumbnail: poster,
    overview: ep.title
  }));

  res.setHeader('Content-Type', 'application/json');
  res.json({
    meta: {
      id: `arch:${identifier}`,
      type: 'series',
      name: seriesName,
      poster,
      background: poster,
      description: `${episodes.length} حلقة`,
      videos
    }
  });
});

// ------------------------------------------------------------------
// Stream: نعرض خيارين — خفيف (أسرع) وأصلي (أوضح)
// ------------------------------------------------------------------
app.get('/stream/series/:id.json', async (req, res) => {
  const raw = req.params.id.replace('arch:', '');
  const cut = raw.lastIndexOf(':');
  if (cut === -1) return res.json({ streams: [] });

  const identifier = raw.substring(0, cut);
  const index = parseInt(raw.substring(cut + 1), 10);
  if (isNaN(index)) return res.json({ streams: [] });

  const episodes = await fetchEpisodes(identifier);
  const ep = episodes[index];
  if (!ep) return res.json({ streams: [] });

  const streams = [];

  // الخفيف أولاً عشان يكون الاختيار الافتراضي
  if (ep.light) {
    streams.push({
      name: '⚡ خفيف',
      title: `${ep.title}\nتشغيل أسرع • ${humanSize(ep.light.size)}`,
      url: `${ARCHIVE_DL}/${identifier}/${encodeURIComponent(ep.light.fileName)}`
    });
  }

  if (ep.original) {
    streams.push({
      name: '🎬 أصلي',
      title: `${ep.title}\nجودة أعلى • ${humanSize(ep.original.size)}`,
      url: `${ARCHIVE_DL}/${identifier}/${encodeURIComponent(ep.original.fileName)}`
    });
  }

  res.setHeader('Content-Type', 'application/json');
  res.json({ streams });
});

app.listen(PORT, () => {
  console.log(`Archive Toons v4 running on port ${PORT}`);
  warmCache();
});
