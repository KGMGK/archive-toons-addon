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
// poster اختياري: لو ما حطيته، ياخذ صورة الأرشيف التلقائية
// ------------------------------------------------------------------
const LIBRARY = [
  {
    catalogId: 'arch-conan',
    catalogName: 'المحقق كونان (مدبلج)',
    items: [] // تتعبى تلقائيًا بالاكتشاف
  },
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
  }
];

const NAME_BY_ID = {};
const POSTER_BY_ID = {};

function reindex() {
  LIBRARY.forEach((cat) => {
    cat.items.forEach((it) => {
      NAME_BY_ID[it.id] = it.name;
      if (it.poster) POSTER_BY_ID[it.id] = it.poster;
    });
  });
}
reindex();

function posterFor(identifier) {
  return POSTER_BY_ID[identifier] || `${ARCHIVE_IMG}/${identifier}`;
}

const episodeCache = {};

function humanSize(bytes) {
  const n = parseInt(bytes, 10);
  if (!n || isNaN(n)) return '';
  if (n > 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  return Math.round(n / (1024 * 1024)) + ' MB';
}

// كشف الفيديو: بالامتداد أو بصيغة الأرشيف
function isVideoFile(f) {
  const name = (f.name || '').toLowerCase();
  const fmt = (f.format || '').toLowerCase();

  const byExt =
    name.endsWith('.mp4') || name.endsWith('.mkv') || name.endsWith('.avi') ||
    name.endsWith('.m4v') || name.endsWith('.webm') || name.endsWith('.mov');

  const byFormat =
    fmt.includes('mpeg4') || fmt.includes('h.264') || fmt.includes('matroska') ||
    fmt.includes('webm') || fmt.includes('quicktime');

  return byExt || byFormat;
}

function cleanTitle(name) {
  return name
    .replace(/\.ia\.mp4$/i, '')
    .replace(/\.(mp4|mkv|avi|m4v|webm|mov)$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

// جلب مع إعادة محاولة
async function fetchMeta(identifier, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await axios.get(`${ARCHIVE_META}/${identifier}`, { timeout: 40000 });
      return res.data || {};
    } catch (err) {
      if (i === tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return {};
}

async function fetchEpisodes(identifier) {
  if (episodeCache[identifier]) return episodeCache[identifier];

  try {
    const data = await fetchMeta(identifier);
    const files = data.files || [];

    const directBase =
      data.server && data.dir ? `https://${data.server}${data.dir}` : null;

    const vids = files.filter((f) => {
      if (!isVideoFile(f)) return false;
      const n = (f.name || '').toLowerCase();
      if (n.includes('_thumb') || n.includes('commentary')) return false;
      return true;
    });

    if (vids.length === 0) {
      console.log(`${identifier}: 0 حلقة (ما فيه ملفات فيديو)`);
      episodeCache[identifier] = [];
      return [];
    }

    const originals = vids.filter((f) => f.source !== 'derivative');
    const derivatives = vids.filter((f) => f.source === 'derivative');

    const base = originals.length > 0 ? originals : derivatives;
    const canPairLight = originals.length > 0 && derivatives.length > 0;

    base.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));

    const episodes = base.map((f) => {
      let light = null;
      if (canPairLight) {
        const linked = derivatives.filter((d) => d.original === f.name);
        if (linked.length > 0) {
          linked.sort((a, b) => parseInt(a.size || 0, 10) - parseInt(b.size || 0, 10));
          const s = linked[0];
          if (parseInt(s.size || 0, 10) < parseInt(f.size || 0, 10) * 0.8) {
            light = { fileName: s.name, size: s.size };
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

// ------------------------------------------------------------------
// اكتشاف أجزاء كونان تلقائيًا
// ------------------------------------------------------------------
async function discoverConan() {
  const cat = LIBRARY.find((c) => c.catalogId === 'arch-conan');
  const found = [];

  for (let s = 1; s <= 30; s++) {
    const id = `anime-detective-conan-season${s}-arabic-dub`;
    try {
      const data = await fetchMeta(id, 1);
      const hasFiles = (data.files || []).some(isVideoFile);
      if (hasFiles) {
        found.push({ id, name: `المحقق كونان - الجزء ${s}` });
        console.log(`✅ لقينا كونان الجزء ${s}`);
      }
    } catch (e) {
      // الجزء مو موجود، نكمل
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  cat.items = found;
  reindex();
  console.log(`اكتمل اكتشاف كونان: ${found.length} جزء`);
}

async function warmCache() {
  await discoverConan();

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
  version: '6.0.0',
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
    poster: posterFor(it.id),
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

  const poster = posterFor(identifier);
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
  console.log(`Archive Toons v6 running on port ${PORT}`);
  warmCache();
});
