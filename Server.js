// ==========================================
// 📦 قسم البيانات — هذا الوحيد اللي تعدل عليه
// ==========================================

const SERIES = {

  "conan": {
    name: "المحقق كونان",
    poster: "https://conanaraby.com/wp-content/uploads/2021/02/Conan-S8-Poster.jpg",
    episodes: [
      { season: 1, episode: 1, title: "الحلقة 1", url: "رابط-الفيديو-المباشر-هنا" },
      // أضف باقي الحلقات هنا
    ]
  }

};

// ==========================================
// ⚙️ الكود الأساسي — لا تلمسه أبداً
// ==========================================

const { addonBuilder } = require("stremio-addon-sdk");

const manifest = {
  id: "org.khalifa.archivetoons",
  version: "1.0.0",
  name: "أرشيف خليفة",
  description: "كرتون مدبلج كلاسيكي من أرشيف",
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
    poster: SERIES[key].poster
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
