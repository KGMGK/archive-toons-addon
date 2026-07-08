const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const PORT = process.env.PORT || 7000;

const ARCHIVE_SEARCH = "https://archive.org/advancedsearch.php";
const ARCHIVE_META = "https://archive.org/metadata";
const ARCHIVE_DL = "https://archive.org/download";

const SHOWS = {
  conan: {
    name: "المحقق كونان",
    queries: [
      '"المحقق كونان"',
      '"كونان" AND مدبلج',
      '"detective conan" AND arabic',
      '"conan" AND arabic'
    ],
    poster: "https://archive.org/services/img/anime-detective-conan-season10-arabic-dub"
  },

  tomjerry: {
    name: "توم وجيري",
    queries: [
      '"توم وجيري"',
      '"توم و جيري"',
      '"tom and jerry" AND arabic',
      '"tom jerry" AND arabic'
    ],
    poster: "https://archive.org/services/img/tom-and-jerry-arabic"
  },

  pinkpanther: {
    name: "النمر الوردي",
    queries: [
      '"النمر الوردي"',
      '"pink panther" AND arabic'
    ],
    poster: "https://archive.org/services/img/pink-panther-arabic"
  },

  spongebob: {
    name: "سبونج بوب",
    queries: [
      '"سبونج بوب"',
      '"spongebob" AND arabic',
      '"sponge bob" AND arabic'
    ],
    poster: "https://archive.org/images/glogo.png"
  },

  mrbean: {
    name: "مستر بين",
    queries: [
      '"مستر بين"',
      '"mr bean" AND arabic',
      '"mister bean" AND arabic'
    ],
    poster: "https://archive.org/images/glogo.png"
  },

  captainmajid: {
    name: "كابتن ماجد",
    queries: [
      '"كابتن ماجد"',
      '"الكابتن ماجد"',
      '"captain tsubasa" AND arabic'
    ],
    poster: "https://archive.org/images/glogo.png"
  },

  adnan: {
    name: "عدنان ولينا",
    queries: [
      '"عدنان ولينا"',
      '"عدنان و لينا"',
      '"future boy conan" AND arabic'
    ],
    poster: "https://archive.org/images/glogo.png"
  },

  pokemon: {
    name: "بوكيمون",
    queries: [
      '"بوكيمون"',
      '"pokemon" AND arabic',
      '"pokemon" AND مدبلج'
    ],
    poster: "https://archive.org/images/glogo.png"
  }
};

const manifest = {
  id: "com.khalifa.archive.toons.clean",
  version: "3.0.0",
  name: "Archive Toons - أرشيف خليفة",
  description: "إضافة خاصة للكرتون والأنمي المدبلج من Archive.org",
  logo: "https://archive.org/images/glogo.png",
  resources: ["catalog", "meta", "stream"],
  types: ["series"],
  catalogs: [
    {
      type: "series",
      id: "archive-toons",
      name: "أرشيف خليفة",
      extra: [{ name: "search", isRequired: false }]
    }
  ],
  idPrefixes: ["arch"],
  behaviorHints: {
    configurable: false,
    configurationRequired: false
  }
};

const builder = new addonBuilder(manifest);

const cache = {
  episodes: {},
  expires: {}
};

const CACHE_TIME = 1000 * 60 * 60 * 6;

function now() {
  return Date.now();
}

function isCacheValid(key) {
  return cache.episodes[key] && cache.expires[key] > now();
}

function cleanText(text) {
  return String(text || "")
    .replace(/\.(mp4|mkv|avi|mov|webm)$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isVideo(name) {
  return /\.(mp4|mkv|avi|mov|webm)$/i.test(String(name || ""));
}

function badText(text) {
  const t = String(text || "").toLowerCase();

  const bad = [
    "sample",
    "trailer",
    "teaser",
    "promo",
    "preview",
    "wallpaper",
    "poster",
    "cover",
    ".jpg",
    ".png",
    ".pdf",
    "torrent",
    "realdebrid",
    "debrid",
    "yts",
    "rarbg"
  ];

  return bad.some((w) => t.includes(w));
}

async function searchArchive(query) {
  const response = await axios.get(ARCHIVE_SEARCH, {
    timeout: 20000,
    params: {
      q: `(${query}) AND mediatype:movies`,
      fl: ["identifier", "title"],
      rows: 50,
      page: 1,
      output: "json"
    }
  });

  return response.data?.response?.docs || [];
}

async function getArchiveVideos(identifier, archiveTitle) {
  const response = await axios.get(`${ARCHIVE_META}/${identifier}`, {
    timeout: 20000
  });

  const files = response.data?.files || [];

  return files
    .filter((file) => isVideo(file.name))
    .filter((file) => !badText(file.name))
    .map((file) => ({
      identifier,
      archiveTitle: archiveTitle || identifier,
      fileName: file.name,
      title: cleanText(file.title || file.name)
    }));
}

async function getEpisodes(showKey) {
  if (isCacheValid(showKey)) return cache.episodes[showKey];

  const show = SHOWS[showKey];
  if (!show) return [];

  const identifiers = new Map();

  for (const query of show.queries) {
    try {
      const results = await searchArchive(query);

      for (const item of results) {
        const text = `${item.title || ""} ${item.identifier || ""}`;
        if (!item.identifier) continue;
        if (badText(text)) continue;

        identifiers.set(item.identifier, {
          identifier: item.identifier,
          title: item.title || item.identifier
        });
      }
    } catch (err) {
      console.log("Search error:", show.name, err.message);
    }
  }

  let episodes = [];

  for (const item of identifiers.values()) {
    try {
      const videos = await getArchiveVideos(item.identifier, item.title);
      episodes = episodes.concat(videos);
    } catch (err) {
      console.log("Metadata error:", item.identifier, err.message);
    }
  }

  const unique = new Map();

  for (const ep of episodes) {
    unique.set(`${ep.identifier}/${ep.fileName}`, ep);
  }

  episodes = Array.from(unique.values());

  episodes.sort((a, b) => {
    const aa = `${a.archiveTitle} ${a.title}`;
    const bb = `${b.archiveTitle} ${b.title}`;
    return aa.localeCompare(bb, "ar", { numeric: true });
  });

  cache.episodes[showKey] = episodes;
  cache.expires[showKey] = now() + CACHE_TIME;

  return episodes;
}

function searchShows(search) {
  const q = String(search || "").trim().toLowerCase();

  if (!q) return Object.keys(SHOWS);

  return Object.keys(SHOWS).filter((key) => {
    const show = SHOWS[key];
    const text = `${show.name} ${show.queries.join(" ")}`.toLowerCase();
    return text.includes(q);
  });
}

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  if (type !== "series" || id !== "archive-toons") {
    return { metas: [] };
  }

  const keys = searchShows(extra?.search);

  return {
    metas: keys.map((key) => {
      const show = SHOWS[key];

      return {
        id: `arch:${key}`,
        type: "series",
        name: show.name,
        poster: show.poster,
        background: show.poster,
        description: "من Archive.org",
        posterShape: "poster"
      };
    })
  };
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== "series") return { meta: null };

  const showKey = id.replace("arch:", "");
  const show = SHOWS[showKey];

  if (!show) return { meta: null };

  const episodes = await getEpisodes(showKey);

  return {
    meta: {
      id: `arch:${showKey}`,
      type: "series",
      name: show.name,
      poster: show.poster,
      background: show.poster,
      description: `عدد الحلقات المتوفرة: ${episodes.length}`,
      videos: episodes.map((ep, index) => ({
        id: `arch:${showKey}:${index}`,
        title: ep.title || `Episode ${index + 1}`,
        season: 1,
        episode: index + 1,
        thumbnail: show.poster
      }))
    }
  };
});

builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== "series") return { streams: [] };

  const parts = id.split(":");
  const showKey = parts[1];
  const index = Number(parts[2]);

  if (!showKey || Number.isNaN(index)) {
    return { streams: [] };
  }

  const episodes = await getEpisodes(showKey);
  const ep = episodes[index];

  if (!ep) {
    return { streams: [] };
  }

  return {
    streams: [
      {
        name: "Archive.org",
        title: ep.title,
        url: `${ARCHIVE_DL}/${ep.identifier}/${ep.fileName}`
      }
    ]
  };
});

serveHTTP(builder.getInterface(), { port: PORT });

console.log(`Archive Toons clean addon running on port ${PORT}`);
