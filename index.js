const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const PORT = process.env.PORT || 7000;

const ARCHIVE_META = "https://archive.org/metadata";
const ARCHIVE_DL = "https://archive.org/download";

const SERIES = {
  conan: {
    name: "المحقق كونان (مدبلج)",
    poster: "https://archive.org/services/img/anime-detective-conan-season10-arabic-dub",
    identifiers: ["anime-detective-conan-season10-arabic-dub"]
  }
};

const manifest = {
  id: "com.khalifa.archivetoons",
  version: "1.0.0",
  name: "Archive Toons - أرشيف خليفة",
  description: "إضافة خاصة تعرض كرتون وأنمي مدبلج من archive.org",
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

const episodeCache = {};

async function fetchFilesForIdentifier(identifier) {
  const url = `${ARCHIVE_META}/${identifier}`;
  const response = await axios.get(url, { timeout: 20000 });
  const data = response.data;

  if (!data || !Array.isArray(data.files)) return [];

  const videoFiles = data.files.filter((file) => {
    const name = (file.name || "").toLowerCase();
    return (
      name.endsWith(".mp4") ||
      name.endsWith(".mkv") ||
      name.endsWith(".avi")
    );
  });

  videoFiles.sort((a, b) =>
    a.name.localeCompare(b.name, "ar", { numeric: true })
  );

  return videoFiles.map((file) => ({
    identifier,
    fileName: file.name,
    title:
      file.title ||
      file.name.replace(/\.(mp4|mkv|avi)$/i, "")
  }));
}

async function getEpisodesForSeries(seriesKey) {
  if (episodeCache[seriesKey]) return episodeCache[seriesKey];

  const series = SERIES[seriesKey];
  if (!series) return [];

  let episodes = [];

  for (const identifier of series.identifiers) {
    try {
      const files = await fetchFilesForIdentifier(identifier);
      episodes = episodes.concat(files);
    } catch (error) {
      console.error(`Archive.org error for ${identifier}:`, error.message);
    }
  }

  episodeCache[seriesKey] = episodes;
  return episodes;
}

builder.defineCatalogHandler(async ({ type, id }) => {
  if (type !== "series" || id !== "archive-toons-catalog") {
    return { metas: [] };
  }

  const metas = Object.keys(SERIES).map((key) => {
    const series = SERIES[key];

    return {
      id: `arch:${key}`,
      type: "series",
      name: series.name,
      poster: series.poster,
      posterShape: "poster"
    };
  });

  return { metas };
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== "series") return { meta: null };

  const key = id.replace("arch:", "");
  const series = SERIES[key];

  if (!series) return { meta: null };

  const episodes = await getEpisodesForSeries(key);

  const videos = episodes.map((episode, index) => ({
    id: `arch:${key}:${index}`,
    title: episode.title,
    season: 1,
    episode: index + 1,
    released: new Date().toISOString()
  }));

  return {
    meta: {
      id: `arch:${key}`,
      type: "series",
      name: series.name,
      poster: series.poster,
      background: series.poster,
      description: "كرتون وأنمي مدبلج من archive.org",
      videos
    }
  };
});

builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== "series") return { streams: [] };

  const parts = id.split(":");
  const key = parts[1];
  const episodeIndex = Number(parts[2]);

  if (!key || Number.isNaN(episodeIndex)) {
    return { streams: [] };
  }

  const episodes = await getEpisodesForSeries(key);
  const episode = episodes[episodeIndex];

  if (!episode) {
    return { streams: [] };
  }

  const directUrl = `${ARCHIVE_DL}/${episode.identifier}/${episode.fileName}`;

  return {
    streams: [
      {
        name: "Archive.org",
        title: episode.title,
        url: directUrl
      }
    ]
  };
});

serveHTTP(builder.getInterface(), {
  port: PORT
});

console.log(`Archive Toons addon running on port ${PORT}`);
