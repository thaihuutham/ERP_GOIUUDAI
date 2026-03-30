import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.constants';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
