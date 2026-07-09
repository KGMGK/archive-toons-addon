const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 7000;

// السماح لأي موقع بالوصول (CORS)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const ARCHIVE_SEARCH = 'https://archive.org/advancedsearch.php';
const ARCHIVE_META = 'https://archive.org/metadata';
const ARCHIVE_DL = 'https://archive.org/download';
const ARCHIVE_IMG = 'https://archive.org/services/img';

// ------------------------------------------------------------------
// المفضلة: مجموعات مثبتة تظهر دايم بالكتالوج
// ------------------------------------------------------------------
const FAVORITES = {
  'conan10': {
    name: 'المحقق كونان - الجزء العاشر (مدبلج)',
    identifier: 'anime-detective-conan-season10-arabic-dub'
  }
};

// كاش لتخزين الحلقات
const episodeCache = {};

// ------------------------------------------------------------------
// يجلب ملفات الفيديو من مجموعة معينة
// ------------------------------------------------------------------
async function fetchEpisodes(identifier) {
  if (episodeCache[identifier]) {
    return episodeCache[identifier];
  }

  try {
    const res = await axios.get(`${ARCHIVE_META}/${identifier}`, { timeout: 20000 });
    const data = res.data;

    if (!data || !data.files) return [];

    const videoFiles = data.files.filter((f) => {
      const name = (f.name || '').toLowerCase();
      const isVideo = name.endsWith('.mp4') || name.endsWith('.mkv') || name.endsWith('.avi');
      // نتجاهل الملفات الوصفية والمصغرات
      const isJunk = name.includes('_thumb') || name.endsWith('.ia.mp4');
      return isVideo && !isJunk;
    });

    videoFiles.sort((a, b) => a.name.localeCompare(b.name, 'ar', { numeric: true }));

    const episodes = videoFiles.map((f) => ({
      identifier,
      fileName: f.name,
      title: f.name.replace(/\.(mp4|mkv|avi)$/i, '')
    }));

    episodeCache[identifier] = episodes;
    return episodes;
  } catch (err) {
    console.error(`خطأ بجلب ${identifier}: ${err.message}`);
    return [];
  }
}

// ------------------------------------------------------------------
// يبحث بـ archive.org عن مجموعات فيديو
// ------------------------------------------------------------------
async function searchArchive(query) {
  try {
    const params = {
      q: `(${query}) AND mediatype:(movies)`,
      'fl[]': ['identifier', 'title', 'year'],
      rows: 40,
      page: 1,
      output: 'json'
    };

    const res = await axios.get(ARCHIVE_SEARCH, { params, timeout: 20000 });
    const docs = (res.data && res.data.response && res.data.response.docs) || [];

    return docs.map((d) => ({
      identifier: d.identifier,
      title: d.title || d.identifier,
      year: d.year
    }));
  } catch (err) {
    console.error(`خطأ بالبحث: ${err.message}`);
    return [];
  }
}

// ------------------------------------------------------------------
// Manifest
// ------------------------------------------------------------------
const manifest = {
  id: 'com.khalifa.archivetoons',
  version: '2.0.0',
  name: 'Archive Toons - أرشيف خليفة',
  description: 'ابحث وشغّل الكرتون والأنمي المدبلج مباشرة من archive.org',
  logo: 'https://archive.org/images/glogo.png',
  resources: ['catalog', 'meta', 'stream'],
  types: ['series'],
  catalogs: [
    {
      type: 'series',
      id: 'archive-favorites',
      name: 'أرشيف خليفة - المفضلة'
    },
    {
      type: 'series',
      id: 'archive-search',
      name: 'بحث بالأرشيف',
      extra: [{ name: 'search', isRequired: true }]
    }
  ],
  idPrefixes: ['arch:']
};

app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(manifest);
});

// ------------------------------------------------------------------
// Catalog: المفضلة (مجموعات ثابتة)
// ------------------------------------------------------------------
app.get('/catalog/series/archive-favorites.json', (req, res) => {
  const metas = Object.keys(FAVORITES).map((key) => {
    const f = FAVORITES[key];
    return {
      id: `arch:${f.identifier}`,
      type: 'series',
      name: f.name,
      poster: `${ARCHIVE_IMG}/${f.identifier}`,
      posterShape: 'poster'
    };
  });
  res.setHeader('Content-Type', 'application/json');
  res.json({ metas });
});

// ------------------------------------------------------------------
// Catalog: البحث الحي
// ------------------------------------------------------------------
app.get('/catalog/series/archive-search/search=:query.json', async (req, res) => {
  const query = decodeURIComponent(req.params.query || '');

  if (!query) {
    return res.json({ metas: [] });
  }

  const results = await searchArchive(query);

  const metas = results.map((r) => ({
    id: `arch:${r.identifier}`,
    type: 'series',
    name: r.title,
    poster: `${ARCHIVE_IMG}/${r.identifier}`,
    posterShape: 'poster',
    description: r.year ? `السنة: ${r.year}` : undefined
  }));

  res.setHeader('Content-Type', 'application/json');
  res.json({ metas });
});

// ------------------------------------------------------------------
// Meta: تفاصيل المجموعة + حلقاتها
// ------------------------------------------------------------------
app.get('/meta/series/:id.json', async (req, res) => {
  const id = req.params.id;
  const identifier = id.replace('arch:', '');

  const episodes = await fetchEpisodes(identifier);

  if (episodes.length === 0) {
    return res.status(404).json({ err: 'not found' });
  }

  // نحاول نجيب اسم المجموعة الحقيقي
  let seriesName = identifier;
  const fav = Object.values(FAVORITES).find((f) => f.identifier === identifier);
  if (fav) {
    seriesName = fav.name;
  }

  const posterUrl = `${ARCHIVE_IMG}/${identifier}`;

  const videos = episodes.map((ep, index) => ({
    id: `arch:${identifier}:${index}`,
    title: ep.title,
    season: 1,
    episode: index + 1,
    thumbnail: posterUrl
  }));

  res.setHeader('Content-Type', 'application/json');
  res.json({
    meta: {
      id: `arch:${identifier}`,
      type: 'series',
      name: seriesName,
      poster: posterUrl,
      background: posterUrl,
      videos
    }
  });
});

// ------------------------------------------------------------------
// Stream: رابط التشغيل المباشر
// ------------------------------------------------------------------
app.get('/stream/series/:id.json', async (req, res) => {
  const id = req.params.id; // arch:IDENTIFIER:INDEX
  const withoutPrefix = id.replace('arch:', '');
  const lastColon = withoutPrefix.lastIndexOf(':');

  if (lastColon === -1) {
    return res.json({ streams: [] });
  }

  const identifier = withoutPrefix.substring(0, lastColon);
  const epIndex = parseInt(withoutPrefix.substring(lastColon + 1), 10);

  if (isNaN(epIndex)) {
    return res.json({ streams: [] });
  }

  const episodes = await fetchEpisodes(identifier);
  const ep = episodes[epIndex];

  if (!ep) {
    return res.json({ streams: [] });
  }

  const directUrl = `${ARCHIVE_DL}/${ep.identifier}/${encodeURIComponent(ep.fileName)}`;

  res.setHeader('Content-Type', 'application/json');
  res.json({
    streams: [
      {
        name: 'Archive',
        title: ep.title,
        url: directUrl
      }
    ]
  });
});

// ------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Archive Toons addon running on port ${PORT}`);
});
