import { describe, expect, it, vi } from 'vitest';
import {
  pickRandomDelaySeconds,
  renderCampaignTemplate,
} from '../src/modules/zalo/zalo-campaign-template.util';

describe('zalo-campaign-template.util', () => {
  it('renders alias variables and spin syntax', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const result = renderCampaignTemplate({
        template: 'Chào {{ten_khach}}, mã {KM-A|KM-B} dành cho bạn: {{ma_khuyen_mai}}',
        context: {
          customer: {
            fullName: 'Khách Lan',
            promoCode: 'SPRING-26',
          },
        },
        allowedVariableKeys: ['ten_khach', 'ma_khuyen_mai'],
      });

      expect(result.ok).toBe(true);
      expect(result.missingVariables).toEqual([]);
      expect(result.content).toBe('Chào Khách Lan, mã KM-A dành cho bạn: SPRING-26');
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('returns missing variables when placeholder cannot be resolved', () => {
    const result = renderCampaignTemplate({
      template: 'Xin chào {{ten_khach}}, mã {{ma_khuyen_mai}}',
      context: {
        customer: {
          fullName: 'Khách Nam',
        },
      },
      allowedVariableKeys: ['ten_khach', 'ma_khuyen_mai'],
    });

    expect(result.ok).toBe(false);
    expect(result.missingVariables).toEqual(['ma_khuyen_mai']);
  });

  it('returns missing variables when key is outside allowlist', () => {
    const result = renderCampaignTemplate({
      template: 'Tên khách: {{ten_khach}}',
      context: {
        customer: {
          fullName: 'Khách Hồng',
        },
      },
      allowedVariableKeys: ['campaign.name'],
    });

    expect(result.ok).toBe(false);
    expect(result.missingVariables).toEqual(['ten_khach']);
  });

  it('picks random delay seconds within configured bounds', () => {
    for (let index = 0; index < 50; index += 1) {
      const seconds = pickRandomDelaySeconds(180, 300);
      expect(seconds).toBeGreaterThanOrEqual(180);
      expect(seconds).toBeLessThanOrEqual(300);
    }
  });
});
