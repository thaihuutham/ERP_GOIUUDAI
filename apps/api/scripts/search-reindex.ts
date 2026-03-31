import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SearchService } from '../src/modules/search/search.service';
import { SearchReindexEntity } from '../src/modules/search/search.types';

const VALID_ENTITIES: SearchReindexEntity[] = ['customers', 'orders', 'products', 'all'];

function parseEntity(argv: string[]): SearchReindexEntity {
  const defaultEntity: SearchReindexEntity = 'all';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--entity') {
      continue;
    }
    const next = argv[i + 1]?.trim().toLowerCase();
    if (!next) {
      return defaultEntity;
    }
    if (VALID_ENTITIES.includes(next as SearchReindexEntity)) {
      return next as SearchReindexEntity;
    }
    throw new Error(`Invalid --entity value: ${next}. Supported: ${VALID_ENTITIES.join(', ')}`);
  }

  return defaultEntity;
}

async function main() {
  const entity = parseEntity(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn']
  });

  try {
    const search = app.get(SearchService);
    const result = await search.reindex(entity);
    console.log(JSON.stringify({ ok: true, result }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exitCode = 1;
});
