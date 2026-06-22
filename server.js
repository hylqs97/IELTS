const express = require("express");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const dayjs = require("dayjs");

const DATA_PATH = path.join(__dirname, "data", "ielts-log.json");
const PUBLIC_PATH = path.join(__dirname, "public");

function isValidDate(dateStr) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }

  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function ensureDataFile() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DATA_PATH)) {
    const seed = {
      meta: { lastViewMode: "contributions" },
      entriesByDate: {},
      updatedAt: null,
    };
    fs.writeFileSync(DATA_PATH, JSON.stringify(seed, null, 2), "utf8");
  }
}

function normalizeData(raw) {
  return {
    meta: {
      lastViewMode: raw?.meta?.lastViewMode || "contributions",
    },
    entriesByDate: raw?.entriesByDate && typeof raw.entriesByDate === "object" ? raw.entriesByDate : {},
    updatedAt: raw?.updatedAt || null,
  };
}

function loadData() {
  ensureDataFile();
  const content = fs.readFileSync(DATA_PATH, "utf8");
  const parsed = JSON.parse(content);
  return normalizeData(parsed);
}

function saveData(data) {
  const payload = normalizeData(data);
  payload.updatedAt = new Date().toISOString();
  fs.writeFileSync(DATA_PATH, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function toNumberOrNull(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function roundToHalfBand(value) {
  return Math.round(value * 2) / 2;
}

function calculateOverallBand(scores = {}) {
  const values = [
    scores.listeningScore,
    scores.readingScore,
    scores.writingScore,
    scores.speakingScore,
  ].map(toNumberOrNull);

  if (values.some((value) => value === null)) {
    return null;
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return roundToHalfBand(average);
}

function sanitizeEntry(input) {
  const base = {
    title: input?.title || null,
    section: input?.section || null,
    note: input?.note || null,
    durationMinutes: toNumberOrNull(input?.durationMinutes),
    source: input?.source || null,
    totalScore: toNumberOrNull(input?.totalScore),
    listeningScore: toNumberOrNull(input?.listeningScore),
    readingScore: toNumberOrNull(input?.readingScore),
    writingScore: toNumberOrNull(input?.writingScore),
    speakingScore: toNumberOrNull(input?.speakingScore),
  };

  const autoTotal = calculateOverallBand(base);
  if (autoTotal !== null) {
    base.totalScore = autoTotal;
  }

  return base;
}

function computeDailyMinutes(entries = []) {
  return entries.reduce((acc, entry) => acc + (Number(entry.durationMinutes) || 0), 0);
}

function getIntensityLevel(totalMinutes) {
  if (totalMinutes <= 0) return 0;
  if (totalMinutes <= 30) return 1;
  if (totalMinutes <= 60) return 2;
  if (totalMinutes <= 120) return 3;
  return 4;
}

function buildCalendarMetrics(data, start, end) {
  const list = [];
  let cursor = dayjs(start);
  const endDate = dayjs(end);

  while (cursor.isBefore(endDate) || cursor.isSame(endDate, "day")) {
    const dateKey = cursor.format("YYYY-MM-DD");
    const entries = data.entriesByDate[dateKey] || [];
    const totalMinutes = computeDailyMinutes(entries);
    list.push({
      date: dateKey,
      totalMinutes,
      count: entries.length,
      intensityLevel: getIntensityLevel(totalMinutes),
    });
    cursor = cursor.add(1, "day");
  }

  return {
    thresholds: [0, 30, 60, 120],
    days: list,
  };
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(PUBLIC_PATH));

  app.get("/api/entries", (req, res) => {
    const data = loadData();
    const { start, end } = req.query;

    if (!start && !end) {
      return res.json(data.entriesByDate);
    }

    if (!isValidDate(start) || !isValidDate(end)) {
      return res.status(400).json({ error: "start and end must be valid YYYY-MM-DD" });
    }

    const filtered = {};
    let cursor = dayjs(start);
    const endDate = dayjs(end);

    while (cursor.isBefore(endDate) || cursor.isSame(endDate, "day")) {
      const key = cursor.format("YYYY-MM-DD");
      if (data.entriesByDate[key]) {
        filtered[key] = data.entriesByDate[key];
      }
      cursor = cursor.add(1, "day");
    }

    return res.json(filtered);
  });

  app.get("/api/entries/:date", (req, res) => {
    const { date } = req.params;
    if (!isValidDate(date)) {
      return res.status(400).json({ error: "date must be valid YYYY-MM-DD" });
    }

    const data = loadData();
    return res.json(data.entriesByDate[date] || []);
  });

  app.post("/api/entries", (req, res) => {
    const { date, entryType } = req.body;
    if (!isValidDate(date)) {
      return res.status(400).json({ error: "date is required and must be YYYY-MM-DD" });
    }

    if (!["practice", "mock"].includes(entryType)) {
      return res.status(400).json({ error: "entryType must be practice or mock" });
    }

    const data = loadData();
    const entry = {
      id: randomUUID(),
      entryType,
      ...sanitizeEntry(req.body),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!Array.isArray(data.entriesByDate[date])) {
      data.entriesByDate[date] = [];
    }

    data.entriesByDate[date].push(entry);
    saveData(data);

    return res.status(201).json(entry);
  });

  app.patch("/api/entries/:date/:id", (req, res) => {
    const { date, id } = req.params;
    if (!isValidDate(date)) {
      return res.status(400).json({ error: "date must be valid YYYY-MM-DD" });
    }

    const data = loadData();
    const list = data.entriesByDate[date] || [];
    const index = list.findIndex((item) => item.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "entry not found" });
    }

    const current = list[index];
    list[index] = {
      ...current,
      ...sanitizeEntry({ ...current, ...req.body }),
      updatedAt: new Date().toISOString(),
    };

    data.entriesByDate[date] = list;
    saveData(data);

    return res.json(list[index]);
  });

  app.delete("/api/entries/:date/:id", (req, res) => {
    const { date, id } = req.params;
    if (!isValidDate(date)) {
      return res.status(400).json({ error: "date must be valid YYYY-MM-DD" });
    }

    const data = loadData();
    const list = data.entriesByDate[date] || [];
    const next = list.filter((entry) => entry.id !== id);

    if (next.length === list.length) {
      return res.status(404).json({ error: "entry not found" });
    }

    if (next.length === 0) {
      delete data.entriesByDate[date];
    } else {
      data.entriesByDate[date] = next;
    }

    saveData(data);
    return res.status(204).send();
  });

  app.get("/api/calendar-metrics", (req, res) => {
    const { start, end } = req.query;

    if (!isValidDate(start) || !isValidDate(end)) {
      return res.status(400).json({ error: "start and end must be valid YYYY-MM-DD" });
    }

    const data = loadData();
    return res.json(buildCalendarMetrics(data, start, end));
  });

  app.get("/api/meta", (_req, res) => {
    const data = loadData();
    return res.json(data.meta);
  });

  app.patch("/api/meta", (req, res) => {
    const { lastViewMode } = req.body;
    if (!["contributions", "month", "list"].includes(lastViewMode)) {
      return res.status(400).json({ error: "lastViewMode must be contributions, month, or list" });
    }

    const data = loadData();
    data.meta.lastViewMode = lastViewMode;
    saveData(data);
    return res.json(data.meta);
  });

  app.get("*", (_req, res) => {
    res.sendFile(path.join(PUBLIC_PATH, "index.html"));
  });

  return app;
}

function startServer(port = process.env.PORT || 3000) {
  const app = createApp();
  const server = app.listen(port, () => {
    const actualPort = server.address().port;
    // eslint-disable-next-line no-console
    console.log(`IELTS tracker running at http://localhost:${actualPort}`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer,
  computeDailyMinutes,
  getIntensityLevel,
  calculateOverallBand,
};



