import { UserRole } from '@prisma/client';

export type AuthUser = {
  sub?: string;
  userId?: string;
  email?: string;
  role?: UserRole;
  tenantId?: string;
  employeeId?: string;
  positionId?: string;
  mustChangePassword?: boolean;
  isActive?: boolean;
};
