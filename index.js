const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const PORT = process.env.PORT || 7000;

const ARCHIVE_SEARCH = "https://archive.org/advancedsearch.php";
const ARCHIVE_META = "https://archive.org/metadata";
const ARCHIVE_DL = "https://archive.org/download";

const SHOWS = {
  conan: {
    name: "المحقق كونان مدبلج",
    searchQuery: 'title:"detective conan" AND (arabic OR مدبلج)',
    poster: "https://archive.org/services/img/anime-detective-conan-season10-arabic-dub"
  },
  tomjerry: {
    name: "توم وجيري مدبلج",
    searchQuery: 'title:"tom and jerry" AND (arabic OR مدبلج)',
    poster: "https://archive.org/services/img/tom-and-jerry-arabic"
  },
  pinkpanther: {
    name: "النمر الوردي مدبلج",
    searchQuery: 'title:"pink panther" AND (arabic OR مدبلج)',
    poster: "https://archive.org/services/img/pink-panther-arabic"
  }
};

const manifest = {
  id: "com.khalifa.archivetoons",
  version: "1.1.0",
  name: "Archive Toons - أرشيف خليفة",
  description: "كرتون وأنمي مدبلج عربي من Archive.org",
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

async function searchArchiveIdentifiers(showKey) {
  if (cache.identifiers[showKey]) return cache.identifiers[showKey];

  const show = SHOWS[showKey];
  if (!show) return [];

  try {
    const res = await axios.get(ARCHIVE_SEARCH, {
      timeout: 20000,
      params: {
        q: show.searchQuery,
        fl: ["identifier", "title"],
        rows: 50,
        page: 1,
        output: "json"
      }
    });

    const docs = res.data?.response?.docs || [];

    const identifiers = docs
      .map((item) => item.identifier)
      .filter(Boolean);

    cache.identifiers[showKey] = identifiers;
    return identifiers;
  } catch (err) {
    console.error("Archive search error:", err.message);
    return [];
  }
}

async function fetchVideosFromIdentifier(identifier) {
  try {
    const res = await axios.get(`${ARCHIVE_META}/${identifier}`, {
      timeout: 20000
    });

    const files = res.data?.files || [];

    return files
      .filter((file) => {
        const name = (file.name || "").toLowerCase();
        return (
          name.endsWith(".mp4") ||
          name.endsWith(".mkv") ||
          name.endsWith(".avi")
        );
      })
      .map((file) => ({
        identifier,
        fileName: file.name,
        title: file.title || file.name.replace(/\.(mp4|mkv|avi)$/i, "")
      }));
  } catch (err) {
    console.error(`Metadata error for ${identifier}:`, err.message);
    return [];
  }
}

async function getEpisodes(showKey) {
  if (cache.episodes[showKey]) return cache.episodes[showKey];

  const identifiers = await searchArchiveIdentifiers(showKey);

  let episodes = [];

  for (const identifier of identifiers) {
    const videos = await fetchVideosFromIdentifier(identifier);
    episodes = episodes.concat(videos);
  }

  episodes.sort((a, b) =>
    a.title.localeCompare(b.title, "ar", { numeric: true })
  );

  cache.episodes[showKey] = episodes;
  return episodes;
}

builder.defineCatalogHandler(async ({ type, id }) => {
  if (type !== "series" || id !== "archive-toons-catalog") {
    return { metas: [] };
  }

  const metas = Object.keys(SHOWS).map((key) => ({
    id: `arch:${key}`,
    type: "series",
    name: SHOWS[key].name,
    poster: SHOWS[key].poster,
    posterShape: "poster"
  }));

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
  const ep = episodes[epIndex];

  if (!ep) return { streams: [] };

  const url = `${ARCHIVE_DL}/${ep.identifier}/${ep.fileName}`;

  return {
    streams: [
      {
        name: "Archive.org",
        title: ep.title,
        url
      }
    ]
  };
});

serveHTTP(builder.getInterface(), {
  port: PORT
});

console.log(`Archive Toons addon running on port ${PORT}`);
