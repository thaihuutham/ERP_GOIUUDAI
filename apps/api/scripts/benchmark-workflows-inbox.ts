import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { GenericStatus, PrismaClient } from '@prisma/client';

type BenchmarkConfig = {
  baseUrl: string;
  tenantId: string;
  approverId: string;
  limit: number;
  totalRequests: number;
  concurrency: number;
  warmupRequests: number;
  p95ThresholdMs: number;
  authToken: string | null;
};

type RequestFailure = {
  status: number;
  message: string;
};

function parseNumber(value: string | undefined, fallback: number, min: number) {
  const parsed = Number(value ?? '');
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.trunc(parsed));
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) {
    return 0;
  }
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx];
}

function nowIso() {
  return new Date().toISOString();
}

function cleanBaseUrl(raw: string) {
  return raw.replace(/\/$/, '');
}

async function resolveApproverId(tenantId: string, explicitApproverId?: string | null) {
  const provided = String(explicitApproverId ?? '').trim();
  if (provided) {
    return provided;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'Không tìm thấy approverId pending. Hãy set WORKFLOW_BENCH_APPROVER_ID hoặc DATABASE_URL để auto-resolve approver.'
    );
  }

  const prisma = new PrismaClient({
    datasourceUrl: databaseUrl
  });

  try {
    const topApprover = await prisma.approval.groupBy({
      by: ['approverId'],
      where: {
        tenant_Id: tenantId,
        status: GenericStatus.PENDING,
        approverId: {
          not: null
        }
      },
      _count: {
        _all: true
      },
      orderBy: {
        _count: {
          _all: 'desc'
        }
      },
      take: 1
    });

    const candidate = String(topApprover[0]?.approverId ?? '').trim();
    if (!candidate) {
      throw new Error(
        `Không resolve được approverId có task PENDING cho tenant '${tenantId}'. Hãy set WORKFLOW_BENCH_APPROVER_ID.`
      );
    }

    return candidate;
  } finally {
    await prisma.$disconnect();
  }
}

async function runSingleRequest(url: string, tenantId: string, authToken: string | null) {
  const startedAt = performance.now();
  const headers: Record<string, string> = {
    'x-tenant-id': tenantId
  };

  if (authToken) {
    headers.authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
    cache: 'no-store'
  });

  const elapsedMs = performance.now() - startedAt;
  if (!response.ok) {
    const body = await response.text();
    const message = body.length > 260 ? `${body.slice(0, 260)}...` : body;
    return {
      elapsedMs,
      failure: {
        status: response.status,
        message
      } as RequestFailure
    };
  }

  await response.arrayBuffer();
  return {
    elapsedMs,
    failure: null
  };
}

async function runBenchmark(config: BenchmarkConfig) {
  const url = `${config.baseUrl}/workflows/inbox?approverId=${encodeURIComponent(config.approverId)}&limit=${config.limit}`;

  const durations: number[] = [];
  const failures: RequestFailure[] = [];
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= config.totalRequests) {
        return;
      }

      const result = await runSingleRequest(url, config.tenantId, config.authToken);
      durations.push(result.elapsedMs);
      if (result.failure) {
        failures.push(result.failure);
      }
    }
  };

  const workers = Array.from({ length: config.concurrency }, () => worker());
  await Promise.all(workers);

  durations.sort((a, b) => a - b);

  const p50 = percentile(durations, 50);
  const p95 = percentile(durations, 95);
  const p99 = percentile(durations, 99);

  const summary = {
    benchmark: 'workflows-inbox',
    timestamp: nowIso(),
    config,
    url,
    result: {
      samples: durations.length,
      failedRequests: failures.length,
      p50Ms: Number(p50.toFixed(2)),
      p95Ms: Number(p95.toFixed(2)),
      p99Ms: Number(p99.toFixed(2)),
      minMs: Number((durations[0] ?? 0).toFixed(2)),
      maxMs: Number((durations[durations.length - 1] ?? 0).toFixed(2)),
      meanMs: Number(
        (
          durations.reduce((sum, current) => sum + current, 0) /
          Math.max(1, durations.length)
        ).toFixed(2)
      )
    },
    acceptance: {
      metric: 'p95 < 300ms',
      thresholdMs: config.p95ThresholdMs,
      passed: failures.length === 0 && p95 < config.p95ThresholdMs
    },
    failures: failures.slice(0, 10)
  };

  console.log(JSON.stringify(summary, null, 2));

  if (failures.length > 0) {
    throw new Error(`Benchmark thất bại: có ${failures.length} request lỗi HTTP.`);
  }

  if (p95 >= config.p95ThresholdMs) {
    throw new Error(`Benchmark thất bại: p95=${p95.toFixed(2)}ms >= ${config.p95ThresholdMs}ms.`);
  }
}

async function main() {
  const tenantId = String(process.env.WORKFLOW_BENCH_TENANT_ID ?? process.env.DEFAULT_TENANT_ID ?? 'GOIUUDAI').trim();
  const baseUrl = cleanBaseUrl(String(process.env.WORKFLOW_BENCH_BASE_URL ?? 'http://127.0.0.1:3001/api/v1').trim());
  const totalRequests = parseNumber(process.env.WORKFLOW_BENCH_REQUESTS, 1000, 1);
  const concurrency = parseNumber(process.env.WORKFLOW_BENCH_CONCURRENCY, 50, 1);
  const warmupRequests = parseNumber(process.env.WORKFLOW_BENCH_WARMUP, 30, 0);
  const limit = parseNumber(process.env.WORKFLOW_BENCH_LIMIT, 100, 1);
  const p95ThresholdMs = parseNumber(process.env.WORKFLOW_BENCH_P95_THRESHOLD_MS, 300, 1);
  const authToken = String(process.env.WORKFLOW_BENCH_AUTH_TOKEN ?? '').trim() || null;

  const approverId = await resolveApproverId(tenantId, process.env.WORKFLOW_BENCH_APPROVER_ID);

  const config: BenchmarkConfig = {
    baseUrl,
    tenantId,
    approverId,
    limit,
    totalRequests,
    concurrency,
    warmupRequests,
    p95ThresholdMs,
    authToken
  };

  const warmupUrl = `${baseUrl}/workflows/inbox?approverId=${encodeURIComponent(approverId)}&limit=${limit}`;
  for (let i = 0; i < warmupRequests; i += 1) {
    const warmupResult = await runSingleRequest(warmupUrl, tenantId, authToken);
    if (warmupResult.failure) {
      throw new Error(
        `Warmup thất bại tại request ${i + 1}: HTTP ${warmupResult.failure.status} - ${warmupResult.failure.message}`
      );
    }
  }

  await runBenchmark(config);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[benchmark-workflows-inbox] ${message}`);
  process.exitCode = 1;
});
