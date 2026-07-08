const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const PORT = process.env.PORT || 7000;

const ARCHIVE_SEARCH = "https://archive.org/advancedsearch.php";
const ARCHIVE_META = "https://archive.org/metadata";
const ARCHIVE_DL = "https://archive.org/download";

const SHOWS = {
  conan: {
    name: "المحقق كونان مدبلج",
    queries: ["المحقق كونان", "detective conan arabic", "conan arabic"],
    poster: "https://archive.org/services/img/anime-detective-conan-season10-arabic-dub"
  },
  tomjerry: {
    name: "توم وجيري مدبلج",
    queries: ["توم وجيري", "توم و جيري", "tom and jerry arabic"],
    poster: "https://archive.org/images/glogo.png"
  },
  pinkpanther: {
    name: "النمر الوردي مدبلج",
    queries: ["النمر الوردي", "pink panther arabic"],
    poster: "https://archive.org/images/glogo.png"
  }
};

const manifest = {
  id: "com.khalifa.archivetoons.private",
  version: "2.0.0",
  name: "Archive Toons - أرشيف خليفة",
  description: "إضافة خاصة للكرتون والأنمي المدبلج من Archive.org",
  logo: "https://archive.org/images/glogo.png",
  resources: ["catalog", "meta", "stream"],
  types: ["series"],
  catalogs: [
    {
      type: "series",
      id: "archive-toons",
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
const cache = {};

function isVideo(name) {
  return /\.(mp4|mkv|avi|mov|webm)$/i.test(name || "");
}

function cleanTitle(name) {
  return String(name || "")
    .replace(/\.(mp4|mkv|avi|mov|webm)$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function badText(text) {
  const t = String(text || "").toLowerCase();
  return [
    "sample",
    "trailer",
    "teaser",
    "promo",
    "preview",
    "wallpaper",
    "poster",
    "cover",
    "pdf",
    "torrent",
    "realdebrid",
    "debrid"
  ].some((w) => t.includes(w));
}

async function searchArchive(query) {
  const res = await axios.get(ARCHIVE_SEARCH, {
    timeout: 30000,
    params: {
      q: `(${query}) AND mediatype:movies`,
      fl: ["identifier", "title"],
      rows: 75,
      output: "json"
    }
  });

  return res.data?.response?.docs || [];
}

async function getVideos(identifier, archiveTitle) {
  const res = await axios.get(`${ARCHIVE_META}/${identifier}`, {
    timeout: 30000
  });

  const files = res.data?.files || [];

  return files
    .filter((f) => isVideo(f.name))
    .filter((f) => !badText(f.name))
    .map((f) => ({
      identifier,
      fileName: f.name,
      archiveTitle,
      title: cleanTitle(f.title || f.name)
    }));
}

async function getEpisodes(showId) {
  if (cache[showId]) return cache[showId];

  const show = SHOWS[showId];
  if (!show) return [];

  const identifiers = new Map();

  for (const query of show.queries) {
    try {
      const results = await searchArchive(query);

      for (const item of results) {
        const text = `${item.title || ""} ${item.identifier || ""}`;
        if (!item.identifier || badText(text)) continue;

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
      const videos = await getVideos(item.identifier, item.title);
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

  episodes.sort((a, b) =>
    `${a.archiveTitle} ${a.title}`.localeCompare(
      `${b.archiveTitle} ${b.title}`,
      "ar",
      { numeric: true }
    )
  );

  cache[showId] = episodes;
  return episodes;
}

builder.defineCatalogHandler(async ({ type, id }) => {
  if (type !== "series" || id !== "archive-toons") return { metas: [] };

  return {
    metas: Object.keys(SHOWS).map((key) => ({
      id: `arch:${key}`,
      type: "series",
      name: SHOWS[key].name,
      poster: SHOWS[key].poster,
      posterShape: "poster",
      description: "من Archive.org"
    }))
  };
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== "series") return { meta: null };

  const showId = id.replace("arch:", "");
  const show = SHOWS[showId];
  if (!show) return { meta: null };

  const episodes = await getEpisodes(showId);

  return {
    meta: {
      id: `arch:${showId}`,
      type: "series",
      name: show.name,
      poster: show.poster,
      background: show.poster,
      description: `عدد الحلقات المتوفرة: ${episodes.length}`,
      videos: episodes.map((ep, index) => ({
        id: `arch:${showId}:${index}`,
        title: ep.title,
        season: 1,
        episode: index + 1,
        thumbnail: show.poster
      }))
    }
  };
});

builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== "series") return { streams: [] };

  const [, showId, indexRaw] = id.split(":");
  const index = Number(indexRaw);

  if (!showId || Number.isNaN(index)) return { streams: [] };

  const episodes = await getEpisodes(showId);
  const ep = episodes[index];

  if (!ep) return { streams: [] };

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

console.log(`Archive Toons running on port ${PORT}`);
