import { ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class IamCeilingService {
  assertNoSelfElevation(actorUserId: string, targetUserId: string) {
    if (this.cleanString(actorUserId) && this.cleanString(actorUserId) === this.cleanString(targetUserId)) {
      throw new ForbiddenException('Không thể tự cấp quyền cao hơn cho chính mình.');
    }
  }

  assertAdminCoreProtection(actorRole: string, targetRole: string) {
    const normalizedActorRole = this.cleanString(actorRole).toUpperCase();
    const normalizedTargetRole = this.cleanString(targetRole).toUpperCase();

    if (normalizedTargetRole === 'ADMIN' && normalizedActorRole !== 'ADMIN') {
      throw new ForbiddenException('Không thể thay đổi quyền lõi của ADMIN.');
    }
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }
}
