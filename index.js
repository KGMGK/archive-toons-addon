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
// المكتبة
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
      { id: 'series-of-mr-bean', name: 'مستر بين - المسلسل الأصلي' },
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

function humanSize(bytes) {
  const n = parseInt(bytes, 10);
  if (!n || isNaN(n)) return '';
  if (n > 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  return Math.round(n / (1024 * 1024)) + ' MB';
}

function isVideoName(name) {
  const n = (name || '').toLowerCase();
  return n.endsWith('.mp4') || n.endsWith('.mkv') || n.endsWith('.avi');
}

// اسم معروض نظيف للحلقة
function cleanTitle(name) {
  return name
    .replace(/\.ia\.mp4$/i, '')
    .replace(/\.(mp4|mkv|avi)$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

// ------------------------------------------------------------------
// جلب الحلقات
// نعتمد على حقول الأرشيف نفسها: source (original/derivative) و original
// ------------------------------------------------------------------
async function fetchEpisodes(identifier) {
  if (episodeCache[identifier]) return episodeCache[identifier];

  try {
    const res = await axios.get(`${ARCHIVE_META}/${identifier}`, { timeout: 25000 });
    const data = res.data || {};
    const files = data.files || [];

    // السيرفر المباشر (نتجنب التحويلة)
    const directBase =
      data.server && data.dir ? `https://${data.server}${data.dir}` : null;

    const originals = [];
    const derivatives = [];

    files.forEach((f) => {
      const name = f.name || '';
      const lower = name.toLowerCase();
      if (!isVideoName(name)) return;
      if (lower.includes('_thumb') || lower.includes('commentary')) return;

      if (f.source === 'derivative') {
        derivatives.push(f);
      } else {
        originals.push(f);
      }
    });

    // لو ما فيه ملفات أصلية (زي مستر بين الأصلي) نستخدم المشتقة كأساس
    const base = originals.length > 0 ? originals : derivatives;
    const useDerivAsLight = originals.length > 0;

    base.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));

    const episodes = base.map((f) => {
      let light = null;

      if (useDerivAsLight) {
        // نلقى المشتقة الأصغر المرتبطة بهالملف
        const linked = derivatives.filter((d) => d.original === f.name);
        if (linked.length > 0) {
          linked.sort((a, b) => parseInt(a.size || 0, 10) - parseInt(b.size || 0, 10));
          const smallest = linked[0];
          // نعرضها بس لو فعلاً أصغر بشكل ملموس
          if (parseInt(smallest.size || 0, 10) < parseInt(f.size || 0, 10) * 0.8) {
            light = { fileName: smallest.name, size: smallest.size };
          }
        }
      }

      return {
        identifier,
        directBase,
        title: cleanTitle(f.name),
        main: { fileName: f.name, size: f.size },
        light
      };
    });

    episodeCache[identifier] = episodes;
    console.log(`${identifier}: ${episodes.length} حلقة`);
    return episodes;
  } catch (err) {
    console.error(`خطأ بجلب ${identifier}: ${err.message}`);
    return [];
  }
}

async function warmCache() {
  const all = [];
  LIBRARY.forEach((c) => c.items.forEach((i) => all.push(i.id)));
  for (const id of all) {
    await fetchEpisodes(id);
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log('اكتمل تسخين الكاش ✅');
}

const manifest = {
  id: 'com.khalifa.archivetoons',
  version: '5.0.0',
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

  // نستخدم السيرفر المباشر لو متوفر، وإلا رابط التحميل العادي
  const buildUrl = (fileName) => {
    const encoded = encodeURIComponent(fileName);
    return ep.directBase
      ? `${ep.directBase}/${encoded}`
      : `${ARCHIVE_DL}/${identifier}/${encoded}`;
  };

  const streams = [];

  if (ep.light) {
    streams.push({
      name: '⚡ خفيف',
      title: `${ep.title}\nأسرع • ${humanSize(ep.light.size)}`,
      url: buildUrl(ep.light.fileName)
    });
  }

  streams.push({
    name: ep.light ? '🎬 أصلي' : '▶️ تشغيل',
    title: `${ep.title}\n${humanSize(ep.main.size)}`,
    url: buildUrl(ep.main.fileName)
  });

  res.setHeader('Content-Type', 'application/json');
  res.json({ streams });
});

app.listen(PORT, () => {
  console.log(`Archive Toons v5 running on port ${PORT}`);
  warmCache();
});
