import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [SearchModule],
  controllers: [CatalogController],
  providers: [CatalogService]
})
export class CatalogModule {}
