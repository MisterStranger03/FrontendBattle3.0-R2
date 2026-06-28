// Single-pass aggregation over the frozen snapshot for the Analytics dashboard.
// Runs only when the dashboard opens (stream is paused), never on the hot path.

const ROI_BUCKETS = [
  { label: '< 0%',     test: (v) => v < 0 },
  { label: '0–50%',    test: (v) => v >= 0   && v < 50 },
  { label: '50–100%',  test: (v) => v >= 50  && v < 100 },
  { label: '100–150%', test: (v) => v >= 100 && v < 150 },
  { label: '150–200%', test: (v) => v >= 150 && v < 200 },
  { label: '200%+',    test: (v) => v >= 200 },
];

function topN(map, n) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

export function aggregate(rows) {
  const statusCounts = { Active: 0, Completed: 0, Planned: 0, Failed: 0 };
  const savingsByIndustry = new Map();
  const robotsByDept = new Map();
  const roiBuckets = new Array(ROI_BUCKETS.length).fill(0);

  let totalSavings = 0;
  let totalRobots = 0;
  let roiSum = 0;
  let roiCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    if (statusCounts[r.project_status] !== undefined) statusCounts[r.project_status]++;

    const savings = Number(r.annual_savings_usd) || 0;
    const robots = Number(r.robots_deployed) || 0;
    const roi = Number(r.roi_percent) || 0;

    totalSavings += savings;
    totalRobots += robots;
    roiSum += roi;
    roiCount++;

    if (r.industry) savingsByIndustry.set(r.industry, (savingsByIndustry.get(r.industry) || 0) + savings);
    if (r.department) robotsByDept.set(r.department, (robotsByDept.get(r.department) || 0) + robots);

    for (let b = 0; b < ROI_BUCKETS.length; b++) {
      if (ROI_BUCKETS[b].test(roi)) { roiBuckets[b]++; break; }
    }
  }

  return {
    count: rows.length,
    totalSavings,
    totalRobots,
    avgRoi: roiCount ? roiSum / roiCount : 0,
    status: {
      labels: ['Active', 'Completed', 'Planned', 'Failed'].filter(s => statusCounts[s] > 0),
      values: ['Active', 'Completed', 'Planned', 'Failed'].filter(s => statusCounts[s] > 0).map(s => statusCounts[s]),
    },
    industries: {
      labels: topN(savingsByIndustry, 8).map(e => e[0]),
      values: topN(savingsByIndustry, 8).map(e => e[1]),
    },
    departments: {
      labels: topN(robotsByDept, 8).map(e => e[0]),
      values: topN(robotsByDept, 8).map(e => e[1]),
    },
    roi: {
      labels: ROI_BUCKETS.map(b => b.label),
      values: roiBuckets,
    },
  };
}
