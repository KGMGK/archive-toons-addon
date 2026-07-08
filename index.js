const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const PORT = process.env.PORT || 7000;

const ARCHIVE_SEARCH = "https://archive.org/advancedsearch.php";
const ARCHIVE_META = "https://archive.org/metadata";
const ARCHIVE_DL = "https://archive.org/download";

const SHOWS = {
  conan: {
    name: "المحقق كونان مدبلج",
    queries: [
      'title:"detective conan" AND arabic',
      'title:"conan" AND arabic',
      'title:"المحقق كونان"',
      'title:"كونان" AND مدبلج'
    ],
    poster: "https://archive.org/services/img/anime-detective-conan-season10-arabic-dub"
  },

  tomjerry: {
    name: "توم وجيري مدبلج",
    queries: [
      'title:"tom and jerry" AND arabic',
      'title:"tom jerry" AND arabic',
      'title:"توم وجيري"',
      'title:"توم و جيري"'
    ],
    poster: "https://archive.org/services/img/Tom_and_Jerry_Arabic"
  },

  pinkpanther: {
    name: "النمر الوردي مدبلج",
    queries: [
      'title:"pink panther" AND arabic',
      'title:"النمر الوردي"',
      'title:"النمر الوردي" AND مدبلج'
    ],
    poster: "https://archive.org/images/glogo.png"
  },

  spongebob: {
    name: "سبونج بوب مدبلج",
    queries: [
      'title:"spongebob" AND arabic',
      'title:"sponge bob" AND arabic',
      'title:"سبونج بوب"',
      'title:"سبونج بوب" AND مدبلج'
    ],
    poster: "https://archive.org/images/glogo.png"
  },

  mrbean: {
    name: "مستر بين كرتون مدبلج",
    queries: [
      'title:"mr bean" AND arabic',
      'title:"mister bean" AND arabic',
      'title:"مستر بين"',
      'title:"مستر بين" AND مدبلج'
    ],
    poster: "https://archive.org/images/glogo.png"
  },

  captinmajid: {
    name: "كابتن ماجد مدبلج",
    queries: [
      'title:"captain tsubasa" AND arabic',
      'title:"captain majid"',
      'title:"كابتن ماجد"',
      'title:"الكابتن ماجد"'
    ],
    poster: "https://archive.org/images/glogo.png"
  },

  adnanlina: {
    name: "عدنان ولينا",
    queries: [
      'title:"future boy conan" AND arabic',
      'title:"عدنان ولينا"',
      'title:"عدنان و لينا"'
    ],
    poster: "https://archive.org/images/glogo.png"
  },

  pokemon: {
    name: "بوكيمون مدبلج",
    queries: [
      'title:"pokemon" AND arabic',
      'title:"pokemon" AND مدبلج',
      'title:"بوكيمون"',
      'title:"بوكيمون" AND مدبلج'
    ],
    poster: "https://archive.org/images/glogo.png"
  }
};

const manifest = {
  id: "com.khalifa.archivetoons",
  version: "1.2.0",
  name: "Archive Toons - أرشيف خليفة",
  description: "إضافة خاصة تجلب الكرتون والأنمي المدبلج من Archive.org",
  logo: "https://archive.org/images/glogo.png",
  resources: ["catalog", "meta", "stream"],
  types: ["series"],
  catalogs: [
    {
      type: "series",
      id: "archive-toons-catalog",
      name: "أرشيف خليفة"
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
  identifiers: {},
  episodes: {}
};

function cleanTitle(name) {
  return String(name || "")
    .replace(/\.(mp4|mkv|avi|mov|webm)$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isVideoFile(fileName) {
  const name = String(fileName || "").toLowerCase();
  return (
    name.endsWith(".mp4") ||
    name.endsWith(".mkv") ||
    name.endsWith(".avi") ||
    name.endsWith(".mov") ||
    name.endsWith(".webm")
  );
}

function isBadTitle(text) {
  const t = String(text || "").toLowerCase();

  const badWords = [
    "sample",
    "trailer",
    "teaser",
    "promo",
    "preview",
    "wallpaper",
    "poster",
    "cover",
    "image",
    "jpg",
    "png",
    "pdf",
    "torrent",
    "realdebrid",
    "debrid"
  ];

  return badWords.some((word) => t.includes(word));
}

async function searchArchiveIdentifiers(showKey) {
  if (cache.identifiers[showKey]) return cache.identifiers[showKey];

  const show = SHOWS[showKey];
  if (!show) return [];

  const found = new Map();

  for (const query of show.queries) {
    try {
      const response = await axios.get(ARCHIVE_SEARCH, {
        timeout: 25000,
        params: {
          q: `(${query}) AND mediatype:movies`,
          fl: ["identifier", "title"],
          rows: 75,
          page: 1,
          output: "json"
        }
      });

      const docs = response.data?.response?.docs || [];

      for (const doc of docs) {
        if (!doc.identifier) continue;

        const title = `${doc.title || ""} ${doc.identifier || ""}`;

        if (isBadTitle(title)) continue;

        found.set(doc.identifier, {
          identifier: doc.identifier,
          title: doc.title || doc.identifier
        });
      }
    } catch (error) {
      console.error(`Search error for ${show.name}:`, error.message);
    }
  }

  const identifiers = Array.from(found.values());

  cache.identifiers[showKey] = identifiers;
  return identifiers;
}

async function fetchVideosFromIdentifier(identifierObj) {
  const identifier = identifierObj.identifier;

  try {
    const response = await axios.get(`${ARCHIVE_META}/${identifier}`, {
      timeout: 25000
    });

    const files = response.data?.files || [];
    const metadataTitle = response.data?.metadata?.title || identifierObj.title || identifier;

    return files
      .filter((file) => isVideoFile(file.name))
      .filter((file) => !isBadTitle(file.name))
      .map((file) => {
        const title = cleanTitle(file.title || file.name);

        return {
          identifier,
          archiveTitle: metadataTitle,
          fileName: file.name,
          title
        };
      });
  } catch (error) {
    console.error(`Metadata error for ${identifier}:`, error.message);
    return [];
  }
}

async function getEpisodes(showKey) {
  if (cache.episodes[showKey]) return cache.episodes[showKey];

  const identifiers = await searchArchiveIdentifiers(showKey);
  let episodes = [];

  for (const identifierObj of identifiers) {
    const videos = await fetchVideosFromIdentifier(identifierObj);
    episodes = episodes.concat(videos);
  }

  const unique = new Map();

  for (const ep of episodes) {
    const key = `${ep.identifier}/${ep.fileName}`;
    unique.set(key, ep);
  }

  episodes = Array.from(unique.values());

  episodes.sort((a, b) => {
    const aa = `${a.archiveTitle} ${a.title}`;
    const bb = `${b.archiveTitle} ${b.title}`;
    return aa.localeCompare(bb, "ar", { numeric: true });
  });

  cache.episodes[showKey] = episodes;
  return episodes;
}

builder.defineCatalogHandler(async ({ type, id }) => {
  if (type !== "series" || id !== "archive-toons-catalog") {
    return { metas: [] };
  }

  const metas = Object.keys(SHOWS).map((key) => {
    const show = SHOWS[key];

    return {
      id: `arch:${key}`,
      type: "series",
      name: show.name,
      poster: show.poster,
      posterShape: "poster",
      description: "من Archive.org"
    };
  });

  return { metas };
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== "series") return { meta: null };

  const showKey = id.replace("arch:", "");
  const show = SHOWS[showKey];

  if (!show) return { meta: null };

  const episodes = await getEpisodes(showKey);

  const videos = episodes.map((ep, index) => ({
    id: `arch:${showKey}:${index}`,
    title: ep.title || `Episode ${index + 1}`,
    season: 1,
    episode: index + 1,
    thumbnail: show.poster,
    released: new Date().toISOString()
  }));

  return {
    meta: {
      id: `arch:${showKey}`,
      type: "series",
      name: show.name,
      poster: show.poster,
      background: show.poster,
      description: `عدد الحلقات المتوفرة: ${videos.length}`,
      videos
    }
  };
});

builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== "series") return { streams: [] };

  const parts = id.split(":");
  const showKey = parts[1];
  const epIndex = Number(parts[2]);

  if (!showKey || Number.isNaN(epIndex)) {
    return { streams: [] };
  }

  const episodes = await getEpisodes(showKey);
  const episode = episodes[epIndex];

  if (!episode) return { streams: [] };

  const url = `${ARCHIVE_DL}/${episode.identifier}/${episode.fileName}`;

  return {
    streams: [
      {
        name: "Archive.org",
        title: episode.title,
        url
      }
    ]
  };
});

serveHTTP(builder.getInterface(), {
  port: PORT
});

console.log(`Archive Toons addon running on port ${PORT}`);
