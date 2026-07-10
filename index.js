const express = require('express');
const app = express();
const PORT = process.env.PORT || 7000;

const BASE_URL = 'https://www.ccdko80.com/get_video.php?videos=';
const CONAN_POSTER = 'https://image.tmdb.org/t/p/w500/oNfQZvar68KMhBuCxMJFLxHNfmu.jpg';
const CONAN_BG = 'https://image.tmdb.org/t/p/w1280/hpGM1o8bFsOEkEVCGCBQDHRHnJH.jpg';

const CONAN_SEASONS = [
  { num: 1,  name: 'المحقق كونان الجزء الأول مدبلج',        epCount: 40  },
  { num: 2,  name: 'المحقق كونان الجزء الثاني مدبلج',       epCount: 39  },
  { num: 3,  name: 'المحقق كونان الجزء الثالث مدبلج',       epCount: 46  },
  { num: 4,  name: 'المحقق كونان الجزء الرابع مدبلج',       epCount: 71  },
  { num: 5,  name: 'المحقق كونان الجزء الخامس مدبلج',       epCount: 52  },
  { num: 6,  name: 'المحقق كونان الجزء السادس مدبلج',       epCount: 52  },
  { num: 7,  name: 'المحقق كونان الجزء السابع مدبلج',       epCount: 52  },
  { num: 8,  name: 'المحقق كونان الجزء الثامن مدبلج',       epCount: 52  },
  { num: 9,  name: 'المحقق كونان الجزء التاسع مدبلج',       epCount: 54  },
  { num: 10, name: 'المحقق كونان الجزء العاشر مدبلج',       epCount: 50  },
  { num: 11, name: 'المحقق كونان الجزء الحادي عشر مدبلج',  epCount: 66  },
];

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const manifest = {
  id: 'org.khalifa.conanarabic',
  version: '1.0.0',
  name: 'كونان بالعربي',
  description: 'المحقق كونان مدبلج — الأجزاء 1 إلى 11 من كونان عربي',
  resources: ['catalog', 'meta', 'stream'],
  types: ['series'],
  catalogs: [
    { type: 'series', id: 'conan-catalog', name: 'المحقق كونان مدبلج' }
  ],
  idPrefixes: ['cn:']
};

app.get('/manifest.json', (req, res) => {
  res.json(manifest);
});

app.get('/catalog/series/:type/:id.json', (req, res) => {
  const metas = CONAN_SEASONS.map((s) => ({
    id: `cn:season:<LaTex>${s.num}`,
    type: 'series',
    name: s.name,
    poster: CONAN_POSTER,
    posterShape: 'poster',
    description: `$</LaTex>{s.epCount} حلقة`
  }));
  res.json({ metas });
});

app.get('/meta/series/:id.json', (req, res) => {
  const id = req.params.id;
  const parts = id.split(':');

  let seasonNum = 1;
  if (parts.length >= 3) {
    seasonNum = parseInt(parts[2], 10);
  }

  const season = CONAN_SEASONS.find(s => s.num === seasonNum);
  if (!season) return res.json({ meta: null });

  const videos = [];
  for (let i = 1; i <= season.epCount; i++) {
    videos.push({
      id: `<LaTex>${id}:$</LaTex>{i}`,
      title: `الحلقة <LaTex>${i}`,
      season: 1,
      episode: i,
      overview: `$</LaTex>{season.name} - الحلقة ${i}`,
      thumbnail: CONAN_BG
    });
  }

  res.json({
    meta: {
      id: id,
      type: 'series',
      name: season.name,
      poster: CONAN_POSTER,
      background: CONAN_BG,
      videos: videos
    }
  });
});

app.get('/stream/series/:id.json', (req, res) => {
  const id = req.params.id;
  const parts = id.split(':');

  let seasonNum, episodeNum;

  if (parts.length === 5) {
    seasonNum = parseInt(parts[2], 10);
    episodeNum = parseInt(parts[3], 10);
  } else if (parts.length === 3) {
    seasonNum = parseInt(parts[1], 10);
    episodeNum = parseInt(parts[2], 10);
  } else {
    return res.json({ streams: [] });
  }

  const season = CONAN_SEASONS.find(s => s.num === seasonNum);
  if (!season || episodeNum < 1 || episodeNum > season.epCount) {
    return res.json({ streams: [] });
  }

  const videoUrl = `${BASE_URL}c<LaTex>${seasonNum}/EP$</LaTex>{episodeNum}.mp4`;

  res.json({
    streams: [
      {
        title: `🎬 كونان بالعربي\nالجزء <LaTex>${seasonNum} - الحلقة $</LaTex>{episodeNum}`,
        url: videoUrl
      }
    ]
  });
});

app.get('/ping', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`Conan Arabic Addon running on port ${PORT}`);
});
