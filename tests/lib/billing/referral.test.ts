import { describe, it, expect } from 'vitest';
import { getOrCreateReferral } from '../../../lib/billing/referral';

describe('referral code generator', () => {
  it('generates a secure referral code for edge case user ids', async () => {
    const mockKv = {
      store: new Map<string, string>(),
      async get(key: string) { return this.store.get(key) || null; },
      async put(key: string, val: string) { this.store.set(key, val); }
    };

    const data1 = await getOrCreateReferral(mockKv as any, '!!');
    expect(data1.code).toBeTruthy();
    expect(data1.code.length).toBeGreaterThan(0);
    // should not contain Math.random output (i.e. '0.xxxx')
    expect(data1.code).not.toContain('0.');
  });
});
