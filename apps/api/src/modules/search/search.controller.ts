import { Controller, Get, Inject, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { GlobalSearchQueryDto } from './dto/global-search.dto';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(@Inject(SearchService) private readonly searchService: SearchService) {}

  @Get('global')
  @Roles(UserRole.USER, UserRole.ADMIN)
  globalSearch(@Query() query: GlobalSearchQueryDto) {
    return this.searchService.globalSearch(query);
  }
}

