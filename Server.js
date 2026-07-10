// ==========================================
// 📦 قسم البيانات — هذا الوحيد اللي تعدل عليه
// ==========================================

const SERIES = {

  // --- أرشيف خليفة ---
  "conan": {
    name: "المحقق كونان",
    poster: "https://conanaraby.com/wp-content/uploads/2021/02/Conan-S8-Poster.jpg",
    episodes: [
      { season: 1, episode: 1, title: "الحلقة 1", url: "رابط-الفيديو-المباشر-هنا" },
      // أضف باقي الحلقات هنا
    ]
  },

  // --- كونان عربي (conanaraby.com) ---
  "conan-ar": {
    name: "المحقق كونان مدبلج — كونان عربي",
    poster: "https://image.tmdb.org/t/p/w500/oNfQZvar68KMhBuCxMJFLxHNfmu.jpg",
    description: "المحقق كونان - الأجزاء 1 إلى 11 مدبلجة",
    episodes: []
  }

};

// تعبئة كونان عربي تلقائياً — 11 جزء — 574 حلقة
const CONAN_SEASONS = [
  { num: 1,  epCount: 40  },
  { num: 2,  epCount: 39  },
  { num: 3,  epCount: 46  },
  { num: 4,  epCount: 71  },
  { num: 5,  epCount: 52  },
  { num: 6,  epCount: 52  },
  { num: 7,  epCount: 52  },
  { num: 8,  epCount: 52  },
  { num: 9,  epCount: 54  },
  { num: 10, epCount: 50  },
  { num: 11, epCount: 66  },
];

CONAN_SEASONS.forEach(season => {
  for (let i = 1; i <= season.epCount; i++) {
    SERIES["conan-ar"].episodes.push({
      season: season.num,
      episode: i,
      title: `الجزء <LaTex>${season.num} - الحلقة $</LaTex>{i}`,
      url: `https://www.ccdko80.com/get_video.php?videos=c<LaTex>${season.num}/EP$</LaTex>{i}.mp4`
    });
  }
});

// ==========================================
// ⚙️ الكود الأساسي — لا تلمسه أبداً
// ==========================================

const { addonBuilder } = require("stremio-addon-sdk");

const manifest = {
  id: "org.khalifa.archivetoons",
  version: "2.0.0",
  name: "أرشيف خليفة",
  description: "كرتون مدبلج كلاسيكي من أرشيف + كونان عربي",
  resources: ["catalog", "meta", "stream"],
  types: ["series"],
  catalogs: [
    { type: "series", id: "khalifa-toons", name: "أرشيف خليفة" }
  ],
  idPrefixes: ["kt:"]
};

const builder = new addonBuilder(manifest);

// الكتالوج — يقرأ كل المسلسلات تلقائياً
builder.defineCatalogHandler(() => {
  const metas = Object.keys(SERIES).map(key => ({
    id: "kt:" + key,
    type: "series",
    name: SERIES[key].name,
    poster: SERIES[key].poster,
    description: SERIES[key].description || ""
  }));
  return Promise.resolve({ metas });
});

// الميتا — يعرض الحلقات تلقائياً
builder.defineMetaHandler(({ id }) => {
  const key = id.replace("kt:", "");
  const s = SERIES[key];
  if (!s) return Promise.resolve({ meta: null });
  
  return Promise.resolve({
    meta: {
      id: id,
      type: "series",
      name: s.name,
      poster: s.poster,
      videos: s.episodes.map(ep => ({
        id: id + ":" + ep.season + ":" + ep.episode,
        title: ep.title,
        season: ep.season,
        episode: ep.episode
      }))
    }
  });
});

// الستريم — يجيب الرابط تلقائياً
builder.defineStreamHandler(({ id }) => {
  const parts = id.split(":");
  const key = parts[1];
  const season = Number(parts[2]);
  const episode = Number(parts[3]);
  
  const s = SERIES[key];
  if (!s) return Promise.resolve({ streams: [] });
  
  const ep = s.episodes.find(e => e.season === season && e.episode === episode);
  if (!ep) return Promise.resolve({ streams: [] });
  
  return Promise.resolve({
    streams: [{ title: "🎬 أرشيف خليفة", url: ep.url }]
  });
});

module.exports = builder.getInterface();
