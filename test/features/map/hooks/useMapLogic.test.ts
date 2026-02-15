import { describe, expect, it } from 'vitest';
import { buildIconSyncPlan } from '@/features/map/hooks/useMapLogic';
import { IconDefinition } from '@/types';

describe('buildIconSyncPlan', () => {
  it('removes stale loaded custom icons that are absent in the next style', () => {
    const loadedUrls = {
      bakery: 'https://cdn.example/bakery-old.png',
      health: 'https://cdn.example/health-old.png',
    };

    const activeIcons: Record<string, IconDefinition> = {
      bakery: {
        category: 'bakery',
        prompt: 'bakery icon',
        imageUrl: 'https://cdn.example/bakery-new.png',
      },
    };

    const plan = buildIconSyncPlan(loadedUrls, activeIcons);

    expect(plan.desiredIconUrls).toEqual({
      bakery: 'https://cdn.example/bakery-new.png',
    });
    expect(plan.staleKeys).toEqual(['health']);
  });

  it('treats empty image entries as stale and keeps only valid custom icon URLs', () => {
    const loadedUrls = {
      shopping: 'https://cdn.example/shopping.png',
      transport: 'https://cdn.example/transport.png',
    };

    const activeIcons: Record<string, IconDefinition> = {
      shopping: {
        category: 'shopping',
        prompt: 'shopping icon',
        imageUrl: '',
      },
      transport: {
        category: 'transport',
        prompt: 'transport icon',
        imageUrl: 'https://cdn.example/transport.png',
      },
    };

    const plan = buildIconSyncPlan(loadedUrls, activeIcons);

    expect(plan.desiredIconUrls).toEqual({
      transport: 'https://cdn.example/transport.png',
    });
    expect(plan.staleKeys).toEqual(['shopping']);
  });
});
