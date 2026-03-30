import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const VN_PHONE_REGEX = /^0[0-9]{9}$/;

export const normalizeVietnamPhone = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const normalized = value.replace(/\s|\.|-/g, '');
  return normalized;
};

export const assertValidVietnamPhone = (value?: string): void => {
  if (!value) return;
  if (!VN_PHONE_REGEX.test(value)) {
    throw new BadRequestException('Số điện thoại không hợp lệ. Định dạng yêu cầu: 0xxxxxxxxx (10 số).');
  }
};

export const assertPhoneNotUsed = async (prisma: PrismaService, phone?: string): Promise<void> => {
  if (!phone) return;

  const [customerExists, employeeExists] = await Promise.all([
    prisma.client.customer.findFirst({ where: { phone } }),
    prisma.client.employee.findFirst({ where: { phone } })
  ]);

  if (customerExists || employeeExists) {
    throw new ConflictException('Số điện thoại đã tồn tại trong hệ thống.');
  }
};
