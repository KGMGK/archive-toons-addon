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

async function fetchEpisodes(identifier) {
  if (episodeCache[identifier]) return episodeCache[identifier];

  try {
    const res = await axios.get(`${ARCHIVE_META}/${identifier}`, { timeout: 25000 });
    const files = (res.data && res.data.files) || [];

    const videos = files.filter((f) => {
      const n = (f.name || '').toLowerCase();
      const isVideo = n.endsWith('.mp4') || n.endsWith('.mkv') || n.endsWith('.avi');
      const isJunk =
        n.endsWith('.ia.mp4') ||
        n.includes('_thumb') ||
        n.includes('commentary') ||
        n.includes('trailer');
      return isVideo && !isJunk;
    });

    videos.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));

    const episodes = videos.map((f) => ({
      identifier,
      fileName: f.name,
      title: f.name.replace(/\.(mp4|mkv|avi)$/i, '').replace(/_/g, ' ').trim()
    }));

    episodeCache[identifier] = episodes;
    return episodes;
  } catch (err) {
    console.error(`خطأ بجلب ${identifier}: ${err.message}`);
    return [];
  }
}

const manifest = {
  id: 'com.khalifa.archivetoons',
  version: '3.0.0',
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

  const url = `${ARCHIVE_DL}/${ep.identifier}/${encodeURIComponent(ep.fileName)}`;

  res.setHeader('Content-Type', 'application/json');
  res.json({
    streams: [{ name: 'Archive', title: ep.title, url }]
  });
});

app.listen(PORT, () => {
  console.log(`Archive Toons v3 running on port ${PORT}`);
});
