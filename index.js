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

const ARCHIVE_META = 'https://archive.org/metadata';
const ARCHIVE_DL = 'https://archive.org/download';

// ------------------------------------------------------------------
// قائمة المحتوى: كل عنصر يمثل "مسلسل/مجموعة" على archive.org
// key: معرّف داخلي بسيط (بالإنجليزي، بدون مسافات)
// name: الاسم اللي يظهر بستريميو
// poster: صورة الغلاف
// identifiers: قائمة معرّفات الأرشيف (تقدر تحط أكثر من جزء بنفس المسلسل)
// ------------------------------------------------------------------
const SERIES = {
  'conan': {
    name: 'المحقق كونان (مدبلج)',
    poster: 'https://archive.org/services/img/anime-detective-conan-season10-arabic-dub',
    identifiers: [
      'anime-detective-conan-season10-arabic-dub'
      // كل ما لقينا جزء جديد نضيف معرّفه هنا بسطر جديد، مثال:
      // 'anime-detective-conan-season11-arabic-dub',
    ]
  }
  // نضيف مسلسلات ثانية هنا لاحقًا (توم وجيري، ديزني، النمر الوردي، مستر بين)
};

// كاش بسيط لتخزين قوائم الحلقات (عشان ما نستعلم archive.org كل مرة)
const episodeCache = {};

// يجلب كل ملفات الفيديو لمجموعة (identifier) من archive.org
async function fetchFilesForIdentifier(identifier) {
  const url = `${ARCHIVE_META}/${identifier}`;
  const res = await axios.get(url, { timeout: 20000 });
  const data = res.data;

  if (!data || !data.files) {
    return [];
  }

  // نفلتر ملفات الفيديو فقط (mp4, mkv, avi)
  const videoFiles = data.files.filter((f) => {
    const name = (f.name || '').toLowerCase();
    return name.endsWith('.mp4') || name.endsWith('.mkv') || name.endsWith('.avi');
  });

  // نرتبهم حسب الاسم (عشان الحلقات تجي بالترتيب الصح)
  videoFiles.sort((a, b) => a.name.localeCompare(b.name, 'ar', { numeric: true }));

  return videoFiles.map((f) => ({
    identifier,
    fileName: f.name,
    title: f.title || f.name.replace(/\.(mp4|mkv|avi)$/i, '')
  }));
}

// يجمع كل حلقات مسلسل (من كل الـ identifiers الخاصة فيه)
async function getEpisodesForSeries(seriesKey) {
  if (episodeCache[seriesKey]) {
    return episodeCache[seriesKey];
  }

  const series = SERIES[seriesKey];
  if (!series) return [];

  let allEpisodes = [];
  for (const identifier of series.identifiers) {
    try {
      const files = await fetchFilesForIdentifier(identifier);
      allEpisodes = allEpisodes.concat(files);
    } catch (err) {
      console.error(`خطأ بجلب ${identifier}: ${err.message}`);
    }
  }

  episodeCache[seriesKey] = allEpisodes;
  return allEpisodes;
}

// ------------------------------------------------------------------
// Manifest
// ------------------------------------------------------------------
const manifest = {
  id: 'com.khalifa.archivetoons',
  version: '1.0.0',
  name: 'Archive Toons - أرشيف خليفة',
  description: 'إضافة خاصة تعرض كرتون وأنمي مدبلج من archive.org',
  logo: 'https://archive.org/images/glogo.png',
  resources: ['catalog', 'meta', 'stream'],
  types: ['series'],
  catalogs: [
    {
      type: 'series',
      id: 'archive-toons-catalog',
      name: 'أرشيف خليفة'
    }
  ],
  idPrefixes: ['arch:']
};

app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(manifest);
});

// ------------------------------------------------------------------
// Catalog: قائمة المسلسلات
// ------------------------------------------------------------------
app.get('/catalog/series/archive-toons-catalog.json', (req, res) => {
  const metas = Object.keys(SERIES).map((key) => {
    const s = SERIES[key];
    return {
      id: `arch:${key}`,
      type: 'series',
      name: s.name,
      poster: s.poster
    };
  });
  res.setHeader('Content-Type', 'application/json');
  res.json({ metas });
});

// ------------------------------------------------------------------
// Meta: تفاصيل المسلسل + قائمة الحلقات
// ------------------------------------------------------------------
app.get('/meta/series/:id.json', async (req, res) => {
  const id = req.params.id;
  const key = id.replace('arch:', '');
  const series = SERIES[key];

  if (!series) {
    return res.status(404).json({ err: 'not found' });
  }

  const episodes = await getEpisodesForSeries(key);

  const videos = episodes.map((ep, index) => ({
    id: `arch:${key}:${index}`,
    title: ep.title,
    season: 1,
    episode: index + 1
  }));

  res.setHeader('Content-Type', 'application/json');
  res.json({
    meta: {
      id: `arch:${key}`,
      type: 'series',
      name: series.name,
      poster: series.poster,
      videos
    }
  });
});

// ------------------------------------------------------------------
// Stream: رابط الحلقة المباشر من archive.org
// ------------------------------------------------------------------
app.get('/stream/series/:id.json', async (req, res) => {
  const id = req.params.id; // arch:conan:5
  const parts = id.split(':');
  const key = parts[1];
  const epIndex = parseInt(parts[2], 10);

  const series = SERIES[key];
  if (!series || isNaN(epIndex)) {
    return res.status(404).json({ streams: [] });
  }

  const episodes = await getEpisodesForSeries(key);
  const ep = episodes[epIndex];

  if (!ep) {
    return res.json({ streams: [] });
  }

  // رابط التشغيل المباشر (mp4 مفتوح، بدون توكن)
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
