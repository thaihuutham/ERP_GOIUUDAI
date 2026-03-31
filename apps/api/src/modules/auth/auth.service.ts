import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { AuthUser } from '../../common/auth/auth-user.type';
import {
  PasswordPolicy,
  generateTemporaryPassword,
  hashPassword,
  validatePasswordByPolicy,
  verifyPassword
} from '../../common/auth/password.util';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireNumber: true,
  requireSpecial: false
};

const MFA_CHALLENGE_TTL = '5m';
const MFA_ISSUER = 'ERP Retail';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

type UserRow = {
  id: string;
  tenant_Id: string;
  email: string;
  passwordHash: string | null;
  role: UserRole;
  employeeId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  mfaEnabled: boolean;
  mfaSecretEnc: string | null;
  mfaEnrolledAt: Date | null;
};

type AccessSecurityPolicy = {
  sessionTimeoutMinutes: number;
  passwordPolicy: PasswordPolicy;
  loginPolicy: {
    maxFailedAttempts: number;
    lockoutMinutes: number;
    mfaRequired: boolean;
  };
};

type MfaChallengeTokenPayload = {
  tokenType: 'mfa_challenge';
  sub: string;
  userId: string;
  tenantId?: string;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  async login(payload: Record<string, unknown>) {
    const email = this.cleanString(payload.email).toLowerCase();
    const password = this.cleanString(payload.password);
    if (!email || !password) {
      throw new BadRequestException('Thiếu email hoặc mật khẩu.');
    }

    const user = await this.prisma.client.user.findFirst({
      where: { email }
    });
    if (!user || !user.isActive || !user.passwordHash) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }

    const security = await this.getAccessSecurityPolicy();
    this.assertNotLocked(user, security);

    const matched = await verifyPassword(password, user.passwordHash);
    if (!matched) {
      await this.registerFailedLoginAttempt(user, security);
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }

    const profile = await this.buildUserProfile(user);

    if (security.loginPolicy.mfaRequired) {
      if (!user.mfaEnabled || !user.mfaSecretEnc) {
        throw new UnauthorizedException('Tài khoản chưa kích hoạt MFA. Vui lòng liên hệ quản trị viên để enroll MFA.');
      }

      const challengeToken = this.signMfaChallengeToken(profile);
      return {
        mfaRequired: true,
        challengeToken,
        challengeExpiresIn: MFA_CHALLENGE_TTL,
        mustChangePassword: profile.mustChangePassword === true,
        user: this.serializeUser(profile)
      };
    }

    await this.clearLoginFailures(user.id, true);

    const accessTokenTtl = this.resolveAccessTokenTtl(security.sessionTimeoutMinutes);
    const accessToken = this.signAccessToken(profile, accessTokenTtl);
    const refreshToken = this.signRefreshToken(profile);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTokenTtl,
      mustChangePassword: profile.mustChangePassword === true,
      mfaRequired: false,
      user: this.serializeUser(profile)
    };
  }

  async refresh(payload: Record<string, unknown>) {
    const refreshToken = this.cleanString(payload.refreshToken);
    if (!refreshToken) {
      throw new BadRequestException('Thiếu refreshToken.');
    }

    const refreshSecret = this.getRefreshSecret();
    let decoded: Record<string, unknown>;
    try {
      decoded = jwt.verify(refreshToken, refreshSecret, {
        algorithms: ['HS256']
      }) as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn.');
    }

    if (String(decoded.tokenType ?? '') !== 'refresh') {
      throw new UnauthorizedException('Refresh token không hợp lệ.');
    }

    const userId = this.cleanString(decoded.userId);
    if (!userId) {
      throw new UnauthorizedException('Refresh token không hợp lệ.');
    }

    const user = await this.prisma.client.user.findFirst({
      where: { id: userId }
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tài khoản không hợp lệ hoặc đã bị khóa.');
    }

    const security = await this.getAccessSecurityPolicy();
    this.assertNotLocked(user, security);

    const profile = await this.buildUserProfile(user);
    const accessTokenTtl = this.resolveAccessTokenTtl(security.sessionTimeoutMinutes);
    const accessToken = this.signAccessToken(profile, accessTokenTtl);
    const nextRefreshToken = this.signRefreshToken(profile);

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTokenTtl,
      mustChangePassword: profile.mustChangePassword === true,
      mfaRequired: false,
      user: this.serializeUser(profile)
    };
  }

  async logout(_user?: Record<string, unknown>) {
    return {
      message: 'Đăng xuất thành công.'
    };
  }

  async changePassword(authUser: Record<string, unknown> | undefined, payload: Record<string, unknown>) {
    const userId = this.cleanString(authUser?.userId ?? authUser?.sub);
    if (!userId) {
      throw new UnauthorizedException('Không xác định được người dùng.');
    }

    const currentPassword = this.cleanString(payload.currentPassword);
    const newPassword = this.cleanString(payload.newPassword);
    if (!newPassword) {
      throw new BadRequestException('Thiếu mật khẩu mới.');
    }

    const user = await this.prisma.client.user.findFirst({
      where: { id: userId }
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tài khoản không hợp lệ hoặc đã bị khóa.');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('Tài khoản chưa có mật khẩu. Vui lòng reset mật khẩu tạm.');
    }

    const mustChangePassword = user.mustChangePassword === true;
    if (!mustChangePassword) {
      if (!currentPassword) {
        throw new BadRequestException('Thiếu mật khẩu hiện tại.');
      }
      const matched = await verifyPassword(currentPassword, user.passwordHash);
      if (!matched) {
        throw new UnauthorizedException('Mật khẩu hiện tại không đúng.');
      }
    }

    const policy = await this.getPasswordPolicy();
    const errors = validatePasswordByPolicy(newPassword, policy);
    if (errors.length > 0) {
      throw new BadRequestException(errors.join(' '));
    }

    const nextHash = await hashPassword(newPassword);
    const now = new Date();
    await this.prisma.client.user.updateMany({
      where: { id: user.id },
      data: {
        passwordHash: nextHash,
        mustChangePassword: false,
        passwordChangedAt: now,
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });

    const nextUser = await this.prisma.client.user.findFirst({
      where: { id: user.id }
    });
    const profile = await this.buildUserProfile(nextUser ?? user);
    const security = await this.getAccessSecurityPolicy();
    const accessTokenTtl = this.resolveAccessTokenTtl(security.sessionTimeoutMinutes);

    return {
      message: 'Đổi mật khẩu thành công.',
      accessToken: this.signAccessToken(profile, accessTokenTtl),
      refreshToken: this.signRefreshToken(profile),
      tokenType: 'Bearer',
      expiresIn: accessTokenTtl,
      mfaRequired: false,
      user: this.serializeUser(profile)
    };
  }

  async enrollMfa(authUser: Record<string, unknown> | undefined) {
    const user = await this.resolveUserFromAuth(authUser);
    const secret = this.generateBase32Secret(20);
    const encryptedSecret = this.encryptMfaSecret(secret);
    const otpAuthUrl = this.buildOtpAuthUrl(user.email, secret);

    await this.prisma.client.user.updateMany({
      where: { id: user.id },
      data: {
        mfaSecretEnc: encryptedSecret,
        mfaEnabled: false,
        mfaEnrolledAt: null
      }
    });

    return {
      message: 'Đã tạo thông tin enroll MFA.',
      secret,
      otpAuthUrl,
      issuer: MFA_ISSUER,
      accountName: user.email
    };
  }

  async verifyEnrollMfa(authUser: Record<string, unknown> | undefined, payload: Record<string, unknown>) {
    const user = await this.resolveUserFromAuth(authUser);
    const code = this.normalizeOtpCode(payload.code);
    if (!code) {
      throw new BadRequestException('Thiếu mã MFA để xác nhận enroll.');
    }

    if (!user.mfaSecretEnc) {
      throw new BadRequestException('Tài khoản chưa có secret MFA. Hãy enroll MFA trước.');
    }

    const secret = this.decryptMfaSecret(user.mfaSecretEnc);
    const valid = this.verifyTotpCode(secret, code);
    if (!valid) {
      throw new UnauthorizedException('Mã MFA không hợp lệ.');
    }

    const now = new Date();
    await this.prisma.client.user.updateMany({
      where: { id: user.id },
      data: {
        mfaEnabled: true,
        mfaEnrolledAt: now,
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });

    return {
      message: 'Kích hoạt MFA thành công.',
      mfaEnabled: true,
      mfaEnrolledAt: now.toISOString()
    };
  }

  async verifyMfaLogin(payload: Record<string, unknown>) {
    const challengeToken = this.cleanString(payload.challengeToken);
    const code = this.normalizeOtpCode(payload.code);
    if (!challengeToken || !code) {
      throw new BadRequestException('Thiếu challengeToken hoặc mã MFA.');
    }

    const decoded = this.verifyMfaChallengeToken(challengeToken);
    const userId = this.cleanString(decoded.userId ?? decoded.sub);
    if (!userId) {
      throw new UnauthorizedException('MFA challenge token không hợp lệ.');
    }

    const user = await this.prisma.client.user.findFirst({
      where: { id: userId }
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tài khoản không hợp lệ hoặc đã bị khóa.');
    }

    const security = await this.getAccessSecurityPolicy();
    this.assertNotLocked(user, security);

    if (!user.mfaEnabled || !user.mfaSecretEnc) {
      throw new UnauthorizedException('Tài khoản chưa kích hoạt MFA.');
    }

    const secret = this.decryptMfaSecret(user.mfaSecretEnc);
    const valid = this.verifyTotpCode(secret, code);

    if (!valid) {
      await this.registerFailedLoginAttempt(user, security);
      throw new UnauthorizedException('Mã MFA không hợp lệ.');
    }

    await this.clearLoginFailures(user.id, true);

    const profile = await this.buildUserProfile(user);
    const accessTokenTtl = this.resolveAccessTokenTtl(security.sessionTimeoutMinutes);

    return {
      accessToken: this.signAccessToken(profile, accessTokenTtl),
      refreshToken: this.signRefreshToken(profile),
      tokenType: 'Bearer',
      expiresIn: accessTokenTtl,
      mustChangePassword: profile.mustChangePassword === true,
      mfaRequired: false,
      mfaVerified: true,
      user: this.serializeUser(profile)
    };
  }

  async resetUserPassword(userId: string, actor?: string) {
    const id = this.cleanString(userId);
    if (!id) {
      throw new BadRequestException('Thiếu userId.');
    }

    const user = await this.prisma.client.user.findFirst({
      where: { id }
    });
    if (!user) {
      throw new BadRequestException('Không tìm thấy tài khoản.');
    }

    const temporaryPassword = generateTemporaryPassword(12);
    const nextHash = await hashPassword(temporaryPassword);
    const now = new Date();
    await this.prisma.client.user.updateMany({
      where: { id },
      data: {
        passwordHash: nextHash,
        mustChangePassword: true,
        passwordResetAt: now,
        updatedAt: now,
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });

    return {
      userId: id,
      actor: this.cleanString(actor) || 'system',
      temporaryPassword,
      mustChangePassword: true,
      resetAt: now.toISOString()
    };
  }

  async createUserWithTemporaryPassword(input: {
    email: string;
    role: UserRole;
    employeeId?: string | null;
    isActive?: boolean;
  }) {
    const email = this.cleanString(input.email).toLowerCase();
    if (!email) {
      throw new BadRequestException('Thiếu email tài khoản.');
    }

    const existing = await this.prisma.client.user.findFirst({
      where: { email }
    });
    if (existing) {
      throw new BadRequestException('Email đã tồn tại trong hệ thống.');
    }

    const temporaryPassword = generateTemporaryPassword(12);
    const passwordHash = await hashPassword(temporaryPassword);
    const now = new Date();
    const tenantId = this.prisma.getTenantId();
    const created = await this.prisma.client.user.create({
      data: {
        tenant_Id: tenantId,
        email,
        role: input.role,
        employeeId: input.employeeId ?? null,
        passwordHash,
        isActive: input.isActive ?? true,
        mustChangePassword: true,
        passwordResetAt: now
      }
    });

    return {
      user: this.serializeUser(await this.buildUserProfile(created)),
      temporaryPassword,
      mustChangePassword: true
    };
  }

  private signAccessToken(user: AuthUser, expiresInOverride?: string) {
    const secret = this.getAccessSecret();
    const payload = {
      sub: user.userId ?? user.sub,
      userId: user.userId,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      employeeId: user.employeeId,
      positionId: user.positionId,
      mustChangePassword: user.mustChangePassword === true,
      isActive: user.isActive !== false
    };
    const options: SignOptions = {
      algorithm: 'HS256',
      expiresIn: (expiresInOverride || this.getAccessTokenTtl()) as SignOptions['expiresIn']
    };
    return jwt.sign(payload, secret, options);
  }

  private signRefreshToken(user: AuthUser) {
    const secret = this.getRefreshSecret();
    const payload = {
      tokenType: 'refresh',
      sub: user.userId ?? user.sub,
      userId: user.userId,
      tenantId: user.tenantId
    };
    const options: SignOptions = {
      algorithm: 'HS256',
      expiresIn: this.getRefreshTokenTtl() as SignOptions['expiresIn']
    };
    return jwt.sign(payload, secret, options);
  }

  private signMfaChallengeToken(user: AuthUser) {
    const secret = this.getRefreshSecret();
    const payload: MfaChallengeTokenPayload = {
      tokenType: 'mfa_challenge',
      sub: user.userId ?? user.sub ?? '',
      userId: user.userId ?? user.sub ?? '',
      tenantId: user.tenantId
    };

    const options: SignOptions = {
      algorithm: 'HS256',
      expiresIn: MFA_CHALLENGE_TTL
    };

    return jwt.sign(payload, secret, options);
  }

  private verifyMfaChallengeToken(token: string) {
    const secret = this.getRefreshSecret();
    let decoded: Record<string, unknown>;
    try {
      decoded = jwt.verify(token, secret, {
        algorithms: ['HS256']
      }) as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('MFA challenge token không hợp lệ hoặc đã hết hạn.');
    }

    if (String(decoded.tokenType ?? '') !== 'mfa_challenge') {
      throw new UnauthorizedException('MFA challenge token không hợp lệ.');
    }

    return decoded;
  }

  private async buildUserProfile(user: UserRow): Promise<AuthUser> {
    let positionId = '';
    if (user.employeeId) {
      const employee = await this.prisma.client.employee.findFirst({
        where: { id: user.employeeId }
      });
      positionId = this.cleanString(employee?.positionId);
    }

    return {
      sub: user.id,
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_Id,
      employeeId: user.employeeId ?? undefined,
      positionId: positionId || undefined,
      mustChangePassword: user.mustChangePassword === true,
      isActive: user.isActive !== false
    };
  }

  private serializeUser(user: AuthUser) {
    return {
      id: user.userId ?? user.sub ?? '',
      email: user.email ?? '',
      role: user.role ?? null,
      tenantId: user.tenantId ?? null,
      employeeId: user.employeeId ?? null,
      positionId: user.positionId ?? null,
      mustChangePassword: user.mustChangePassword === true,
      isActive: user.isActive !== false
    };
  }

  private async resolveUserFromAuth(authUser: Record<string, unknown> | undefined) {
    const userId = this.cleanString(authUser?.userId ?? authUser?.sub);
    if (!userId) {
      throw new UnauthorizedException('Không xác định được người dùng.');
    }

    const user = await this.prisma.client.user.findFirst({
      where: { id: userId }
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tài khoản không hợp lệ hoặc đã bị khóa.');
    }

    return user;
  }

  private async getAccessSecurityPolicy(): Promise<AccessSecurityPolicy> {
    try {
      const runtime = await this.runtimeSettings.getAccessSecurityRuntime();
      return {
        sessionTimeoutMinutes: this.toInt(runtime.sessionTimeoutMinutes, 480, 5, 1440),
        passwordPolicy: {
          minLength: this.toInt(runtime.passwordPolicy.minLength, DEFAULT_PASSWORD_POLICY.minLength, 6, 64),
          requireUppercase: this.toBool(runtime.passwordPolicy.requireUppercase, DEFAULT_PASSWORD_POLICY.requireUppercase),
          requireNumber: this.toBool(runtime.passwordPolicy.requireNumber, DEFAULT_PASSWORD_POLICY.requireNumber),
          requireSpecial: this.toBool(runtime.passwordPolicy.requireSpecial, DEFAULT_PASSWORD_POLICY.requireSpecial)
        },
        loginPolicy: {
          maxFailedAttempts: this.toInt(runtime.loginPolicy.maxFailedAttempts, 5, 1, 20),
          lockoutMinutes: this.toInt(runtime.loginPolicy.lockoutMinutes, 15, 1, 240),
          mfaRequired: this.toBool(runtime.loginPolicy.mfaRequired, false)
        }
      };
    } catch {
      return {
        sessionTimeoutMinutes: 480,
        passwordPolicy: DEFAULT_PASSWORD_POLICY,
        loginPolicy: {
          maxFailedAttempts: 5,
          lockoutMinutes: 15,
          mfaRequired: false
        }
      };
    }
  }

  private async getPasswordPolicy(): Promise<PasswordPolicy> {
    const policy = await this.getAccessSecurityPolicy();
    return policy.passwordPolicy;
  }

  private assertNotLocked(user: UserRow, security: AccessSecurityPolicy) {
    if (!user.lockedUntil) {
      return;
    }

    const lockedUntilAt = user.lockedUntil.getTime();
    if (lockedUntilAt <= Date.now()) {
      return;
    }

    const minutesLeft = Math.ceil((lockedUntilAt - Date.now()) / 60_000);
    throw new UnauthorizedException(
      `Tài khoản đang tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau ${Math.max(1, minutesLeft)} phút.`
    );
  }

  private async registerFailedLoginAttempt(user: UserRow, security: AccessSecurityPolicy) {
    const nextAttempts = (user.failedLoginAttempts ?? 0) + 1;
    const lockThreshold = security.loginPolicy.maxFailedAttempts;
    const lockoutMinutes = security.loginPolicy.lockoutMinutes;

    const shouldLock = nextAttempts >= lockThreshold;
    await this.prisma.client.user.updateMany({
      where: { id: user.id },
      data: {
        failedLoginAttempts: shouldLock ? 0 : nextAttempts,
        lockedUntil: shouldLock ? new Date(Date.now() + lockoutMinutes * 60_000) : null
      }
    });
  }

  private async clearLoginFailures(userId: string, bumpLastLoginAt = false) {
    await this.prisma.client.user.updateMany({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: bumpLastLoginAt ? new Date() : undefined
      }
    });
  }

  private resolveAccessTokenTtl(sessionTimeoutMinutes?: number) {
    if (typeof sessionTimeoutMinutes === 'number' && Number.isFinite(sessionTimeoutMinutes)) {
      const minutes = this.toInt(sessionTimeoutMinutes, 480, 5, 1440);
      return `${minutes}m`;
    }
    return this.getAccessTokenTtl();
  }

  private getAccessSecret() {
    const secret = this.cleanString(this.config.get<string>('JWT_SECRET'));
    if (!secret) {
      throw new UnauthorizedException('Thiếu cấu hình JWT_SECRET.');
    }
    return secret;
  }

  private getRefreshSecret() {
    return this.cleanString(this.config.get<string>('JWT_REFRESH_SECRET')) || this.getAccessSecret();
  }

  private getAccessTokenTtl() {
    return this.cleanString(this.config.get<string>('JWT_ACCESS_EXPIRES_IN')) || '8h';
  }

  private getRefreshTokenTtl() {
    return this.cleanString(this.config.get<string>('JWT_REFRESH_EXPIRES_IN')) || '7d';
  }

  private getMfaEncryptionKey() {
    const source = this.cleanString(this.config.get<string>('MFA_SECRET_ENCRYPTION_KEY')) || this.getAccessSecret();
    return createHash('sha256').update(source).digest();
  }

  private encryptMfaSecret(secret: string) {
    const iv = randomBytes(12);
    const key = this.getMfaEncryptionKey();
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
  }

  private decryptMfaSecret(value: string) {
    const raw = this.cleanString(value);
    if (!raw) {
      return '';
    }

    if (!raw.startsWith('v1.')) {
      return raw;
    }

    const parts = raw.split('.');
    if (parts.length !== 4) {
      throw new UnauthorizedException('MFA secret không hợp lệ.');
    }

    try {
      const iv = Buffer.from(parts[1], 'base64url');
      const encrypted = Buffer.from(parts[2], 'base64url');
      const tag = Buffer.from(parts[3], 'base64url');

      const decipher = createDecipheriv('aes-256-gcm', this.getMfaEncryptionKey(), iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      throw new UnauthorizedException('MFA secret không hợp lệ.');
    }
  }

  private buildOtpAuthUrl(email: string, secret: string) {
    const label = encodeURIComponent(`${MFA_ISSUER}:${email}`);
    const issuer = encodeURIComponent(MFA_ISSUER);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  }

  private generateBase32Secret(size: number) {
    return this.base32Encode(randomBytes(size));
  }

  private normalizeOtpCode(value: unknown) {
    const normalized = String(value ?? '').replace(/\s+/g, '').trim();
    if (!/^\d{6}$/.test(normalized)) {
      return '';
    }
    return normalized;
  }

  private verifyTotpCode(secret: string, code: string, window = 1) {
    if (!secret || !code) {
      return false;
    }

    const key = this.base32Decode(secret);
    const currentCounter = Math.floor(Date.now() / 1000 / 30);
    const codeBuffer = Buffer.from(code, 'utf8');

    for (let offset = -window; offset <= window; offset += 1) {
      const token = this.generateTotpToken(key, currentCounter + offset);
      const tokenBuffer = Buffer.from(token, 'utf8');
      if (tokenBuffer.length === codeBuffer.length && timingSafeEqual(tokenBuffer, codeBuffer)) {
        return true;
      }
    }

    return false;
  }

  private generateTotpToken(secret: Buffer, counter: number) {
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuffer.writeUInt32BE(counter % 0x100000000, 4);

    const hmac = createHmac('sha1', secret).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24)
      | ((hmac[offset + 1] & 0xff) << 16)
      | ((hmac[offset + 2] & 0xff) << 8)
      | (hmac[offset + 3] & 0xff);

    const token = binary % 1_000_000;
    return token.toString().padStart(6, '0');
  }

  private base32Encode(buffer: Buffer) {
    let bits = 0;
    let value = 0;
    let output = '';

    for (const byte of buffer) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }

    return output;
  }

  private base32Decode(input: string) {
    const normalized = input.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];

    for (const char of normalized) {
      const idx = BASE32_ALPHABET.indexOf(char);
      if (idx < 0) {
        continue;
      }

      value = (value << 5) | idx;
      bits += 5;

      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }

    return Buffer.from(bytes);
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }

  private toInt(value: unknown, fallback: number, min?: number, max?: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    const normalized = Math.trunc(parsed);
    if (typeof min === 'number' && normalized < min) {
      return min;
    }
    if (typeof max === 'number' && normalized > max) {
      return max;
    }
    return normalized;
  }

  private toBool(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }
    return fallback;
  }
}
