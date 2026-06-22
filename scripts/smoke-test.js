const assert = require("assert");

const { startServer } = require("../server");

async function run() {
  const server = startServer(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  let createdEntry = null;
  const date = "2026-06-22";

  try {
    const createRes = await fetch(`${base}/api/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        entryType: "mock",
        title: "Cambridge 18 Test 2",
        durationMinutes: 160,
        listeningScore: 7,
        readingScore: 7,
        writingScore: 6.5,
        speakingScore: 6.5,
      }),
    });

    assert.strictEqual(createRes.status, 201, "POST /api/entries should return 201");
    createdEntry = await createRes.json();
    assert.ok(createdEntry.id, "created entry should contain id");
    assert.strictEqual(createdEntry.totalScore, 7, "totalScore should be auto-calculated from skill scores");

    const listRes = await fetch(`${base}/api/entries/${date}`);
    assert.strictEqual(listRes.status, 200, "GET /api/entries/:date should return 200");
    const list = await listRes.json();
    assert.ok(Array.isArray(list), "entry list should be an array");
    assert.ok(list.some((entry) => entry.id === createdEntry.id), "entry list should include created entry");

    const metricsRes = await fetch(`${base}/api/calendar-metrics?start=${date}&end=${date}`);
    assert.strictEqual(metricsRes.status, 200, "GET /api/calendar-metrics should return 200");
    const metrics = await metricsRes.json();
    assert.strictEqual(metrics.days[0].totalMinutes >= 160, true, "daily minutes should include created entry");

    // eslint-disable-next-line no-console
    console.log("Smoke test passed");
  } finally {
    if (createdEntry?.id) {
      await fetch(`${base}/api/entries/${date}/${createdEntry.id}`, { method: "DELETE" });
    }
    server.close();
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

