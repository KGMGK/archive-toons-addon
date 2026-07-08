const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 7000;

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

const SERIES = {
  'conan': {
    name: 'المحقق كونان (مدبلج)',
    poster: 'https://archive.org/services/img/anime-detective-conan-season10-arabic-dub',
    identifiers: [
      'anime-detective-conan-season10-arabic-dub'
    ]
  }
};

const episodeCache = {};

async function fetchFilesForIdentifier(identifier) {
  const url = `${ARCHIVE_META}/${identifier}`;
  const res = await axios.get(url, { timeout: 20000 });
  const data = res.data;

  if (!data || !data.files) {
    return [];
  }

  const videoFiles = data.files.filter((f) => {
    const name = (f.name || '').toLowerCase();
    return name.endsWith('.mp4') || name.endsWith('.mkv') || name.endsWith('.avi');
  });

  videoFiles.sort((a, b) => a.name.localeCompare(b.name, 'ar', { numeric: true }));

  return videoFiles.map((f) => ({
    identifier,
    fileName: f.name,
    title: f.title || f.name.replace(/\.(mp4|mkv|avi)$/i, '')
  }));
}

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

app.get('/stream/series/:id.json', async (req, res) => {
  const id = req.params.id;
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

app.listen(PORT, () => {
  console.log(`Archive Toons addon running on port ${PORT}`);
});
