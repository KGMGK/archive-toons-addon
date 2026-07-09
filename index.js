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

const TMDB_KEY = process.env.TMDB_KEY || '';
const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
const TMDB_BG = 'https://image.tmdb.org/t/p/w1280';

const LIBRARY = [
  {
    catalogId: 'arch-conan',
    catalogName: 'المحقق كونان (مدبلج)',
    items: [],
    tmdb: 'Detective Conan',
    tmdbType: 'tv'
  },
  {
    catalogId: 'arch-tomjerry',
    catalogName: 'توم وجيري - كلاسيك',
    tmdb: 'Tom and Jerry',
    tmdbType: 'tv',
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
    tmdb: 'The Pink Panther Show',
    tmdbType: 'tv',
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
      { id: 'series-of-mr-bean', name: 'مستر بين - المسلسل الأصلي', tmdb: 'Mr. Bean', tmdbType: 'tv' },
      { id: 'mr-bean-animated-series', name: 'مستر بين - الكرتون', tmdb: 'Mr. Bean: The Animated Series', tmdbType: 'tv' }
    ]
  }
];

const NAME_BY_ID = {};
const ART_BY_ID = {};

function reindex() {
  LIBRARY.forEach((cat) => {
    cat.items.forEach((it) => {
      NAME_BY_ID[it.id] = it.name;
    });
  });
}
reindex();

async function tmdbArt(query, type) {
  if (!TMDB_KEY || !query) return null;

  try {
    const res = await axios.get(`${TMDB_API}/search/${type || 'tv'}`, {
      params: { api_key: TMDB_KEY, query, language: 'ar' },
      timeout: 15000
    });

    const first = (res.data && res.data.results && res.data.results[0]) || null;
    if (!first) return null;

    return {
      poster: first.poster_path ? `${TMDB_IMG}${first.poster_path}` : null,
      background: first.backdrop_path ? `${TMDB_BG}${first.backdrop_path}` : null
    };
  } catch (err) {
    console.error(`TMDB (${query}): ${err.message}`);
    return null;
  }
}

async function loadArtwork() {
  if (!TMDB_KEY) {
    console.log('⚠️ ما فيه TMDB_KEY — بنستخدم صور الأرشيف');
    return;
  }

  for (const cat of LIBRARY) {
    let catArt = null;
    if (cat.tmdb) {
      catArt = await tmdbArt(cat.tmdb, cat.tmdbType);
      await new Promise((r) => setTimeout(r, 300));
    }

    for (const it of cat.items) {
      let art = null;
      if (it.tmdb) {
        art = await tmdbArt(it.tmdb, it.tmdbType);
        await new Promise((r) => setTimeout(r, 300));
      }
      const chosen = art || catArt;
      if (chosen && chosen.poster) {
        ART_BY_ID[it.id] = chosen;
        console.log(`🖼 بوستر: ${it.name}`);
      }
    }
  }
  console.log('اكتمل تحميل البوسترات ✅');
}

function posterFor(id) {
  const a = ART_BY_ID[id];
  return (a && a.poster) || `${ARCHIVE_IMG}/${id}`;
}

function backgroundFor(id) {
  const a = ART_BY_ID[id];
  return (a && (a.background || a.poster)) || `${ARCHIVE_IMG}/${id}`;
}

const episodeCache = {};

function humanSize(bytes) {
  const n = parseInt(bytes, 10);
  if (!n || isNaN(n)) return '';
  if (n > 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  return Math.round(n / (1024 * 1024)) + ' MB';
}

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
    const directBase = data.server && data.dir ? `https://${data.server}${data.dir}` : null;

    const vids = files.filter((f) => {
      if (!isVideoFile(f)) return false
