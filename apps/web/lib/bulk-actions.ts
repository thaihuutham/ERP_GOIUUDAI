export type BulkRowId = string | number;

export type BulkFailure = {
  id: BulkRowId;
  message: string;
};

export type BulkExecutionResult = {
  total: number;
  successCount: number;
  failedCount: number;
  failedIds: BulkRowId[];
  failures: BulkFailure[];
  actionLabel?: string;
  message?: string;
};

type RunBulkOperationOptions<TId extends BulkRowId> = {
  ids: TId[];
  execute: (id: TId, index: number) => Promise<void>;
  chunkSize?: number;
  continueOnError?: boolean;
};

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Unknown bulk execution error';
}

export function formatBulkSummary(result: BulkExecutionResult, defaultActionLabel = 'Thao tác') {
  const label = result.actionLabel || defaultActionLabel;
  if (result.failedCount === 0) {
    return `${label}: thành công ${result.successCount}/${result.total}.`;
  }
  return `${label}: thành công ${result.successCount}/${result.total}, lỗi ${result.failedCount}.`;
}

export async function runBulkOperation<TId extends BulkRowId>({
  ids,
  execute,
  chunkSize = 10,
  continueOnError = true
}: RunBulkOperationOptions<TId>): Promise<BulkExecutionResult> {
  const failures: BulkFailure[] = [];
  let successCount = 0;

  if (!Array.isArray(ids) || ids.length === 0) {
    return {
      total: 0,
      successCount: 0,
      failedCount: 0,
      failedIds: [],
      failures: []
    };
  }

  for (let start = 0; start < ids.length; start += chunkSize) {
    const chunk = ids.slice(start, start + chunkSize);
    const outcomes = await Promise.allSettled(
      chunk.map((id, index) => execute(id, start + index))
    );

    outcomes.forEach((outcome, index) => {
      const id = chunk[index];
      if (outcome.status === 'fulfilled') {
        successCount += 1;
        return;
      }

      failures.push({
        id,
        message: toErrorMessage(outcome.reason)
      });
    });

    if (!continueOnError && failures.length > 0) {
      break;
    }
  }

  const failedIds = failures.map((item) => item.id);
  return {
    total: ids.length,
    successCount,
    failedCount: failedIds.length,
    failedIds,
    failures
  };
}

