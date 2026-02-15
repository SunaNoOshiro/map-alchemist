import { describe, expect, it, vi } from 'vitest';
import {
  GitHubPagesPublisher,
  buildPagesBaseUrl,
  buildPublishPaths,
  parseGitHubRepo,
  buildTreeEntries,
  areBlobShasIdentical,
  computeGitBlobSha
} from '@/features/styles/services/GitHubPagesPublisher';

describe('GitHubPagesPublisher.parseGitHubRepo', () => {
  it('parses owner/repo input', () => {
    expect(parseGitHubRepo('SunaNoOshiro/map-alchemist')).toEqual({
      owner: 'SunaNoOshiro',
      repo: 'map-alchemist'
    });
  });

  it('parses https GitHub URL', () => {
    expect(parseGitHubRepo('https://github.com/owner/repo')).toEqual({
      owner: 'owner',
      repo: 'repo'
    });
  });

  it('parses git SSH URL', () => {
    expect(parseGitHubRepo('git@github.com:octo/test.git')).toEqual({
      owner: 'octo',
      repo: 'test'
    });
  });
});

describe('GitHubPagesPublisher.buildPagesBaseUrl', () => {
  it('uses root URL for user pages repo', () => {
    expect(buildPagesBaseUrl('octo', 'octo.github.io')).toBe('https://octo.github.io');
  });

  it('uses project URL for non-user repos', () => {
    expect(buildPagesBaseUrl('octo', 'maps')).toBe('https://octo.github.io/maps');
  });
});

describe('GitHubPagesPublisher.buildPublishPaths', () => {
  it('builds sprite and style paths from slug', () => {
    expect(buildPublishPaths('pirates')).toEqual({
      spriteBasePath: 'sprites/pirates',
      spriteJsonPath: 'public/sprites/pirates.json',
      spritePngPath: 'public/sprites/pirates.png',
      sprite2xJsonPath: 'public/sprites/pirates@2x.json',
      sprite2xPngPath: 'public/sprites/pirates@2x.png',
      styleJsonPath: 'public/styles/pirates.json',
      stylePublicPath: 'styles/pirates.json'
    });
  });
});

describe('GitHubPagesPublisher.buildTreeEntries', () => {
  it('maps blob shas into tree entries', () => {
    const entries = buildTreeEntries([
      { path: 'sprites/demo.png', sha: 'sha123' },
      { path: 'styles/demo.json', sha: 'sha456' }
    ]);

    expect(entries).toEqual([
      { path: 'sprites/demo.png', sha: 'sha123', mode: '100644', type: 'blob' },
      { path: 'styles/demo.json', sha: 'sha456', mode: '100644', type: 'blob' }
    ]);
  });
});

describe('GitHubPagesPublisher.computeGitBlobSha', () => {
  it('matches git hash-object output for string content', async () => {
    await expect(computeGitBlobSha('map-alchemist')).resolves.toBe('f7bc6197b0dcfd033048fdba8a0e1b93f4c56c0a');
  });
});

describe('GitHubPagesPublisher.areBlobShasIdentical', () => {
  it('returns true when every local file has matching remote blob sha', () => {
    const local = [
      { path: 'public/styles/demo.json', sha: 'sha-a' },
      { path: 'public/sprites/demo.png', sha: 'sha-b' }
    ];
    const remote = [
      { path: 'public/sprites/demo.png', sha: 'sha-b' },
      { path: 'public/styles/demo.json', sha: 'sha-a' }
    ];

    expect(areBlobShasIdentical(local, remote)).toBe(true);
  });

  it('returns false when any sha differs or file is missing remotely', () => {
    const local = [
      { path: 'public/styles/demo.json', sha: 'sha-a' },
      { path: 'public/sprites/demo.png', sha: 'sha-b' }
    ];
    const remote = [
      { path: 'public/styles/demo.json', sha: 'sha-a' }
    ];

    expect(areBlobShasIdentical(local, remote)).toBe(false);
  });
});

describe('GitHubPagesPublisher.publish duplicate detection', () => {
  const repoInput = 'octo/maps';
  const branch = 'main';
  const token = 'token';
  const styleSlug = 'demo';
  const styleName = 'Demo Style';
  const styleJson = { version: 8 };
  const spriteJson = { one: 1 };
  const sprite2xJson = { two: 2 };
  const spritePng = 'sprite-1x' as unknown as Blob;
  const sprite2xPng = 'sprite-2x' as unknown as Blob;
  const paths = buildPublishPaths(styleSlug);

  it('skips commit and returns alreadyPublished when all target blobs are identical', async () => {
    const localBlobShas = {
      [paths.spriteJsonPath]: await computeGitBlobSha(JSON.stringify(spriteJson, null, 2)),
      [paths.spritePngPath]: await computeGitBlobSha(spritePng),
      [paths.sprite2xJsonPath]: await computeGitBlobSha(JSON.stringify(sprite2xJson, null, 2)),
      [paths.sprite2xPngPath]: await computeGitBlobSha(sprite2xPng),
      [paths.styleJsonPath]: await computeGitBlobSha(JSON.stringify(styleJson, null, 2))
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method || 'GET').toUpperCase();

      if (method === 'GET' && url.includes('/git/ref/heads/')) {
        return new Response(JSON.stringify({ object: { sha: 'head-sha' } }), { status: 200 });
      }

      if (method === 'GET' && url.includes('/git/commits/')) {
        return new Response(JSON.stringify({ tree: { sha: 'tree-sha' } }), { status: 200 });
      }

      if (method === 'GET' && url.includes('/git/trees/tree-sha?recursive=1')) {
        return new Response(
          JSON.stringify({
            tree: Object.entries(localBlobShas).map(([path, sha]) => ({ path, sha, type: 'blob' }))
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ message: `Unexpected ${method} ${url}` }), { status: 500 });
    });

    try {
      const result = await GitHubPagesPublisher.publish({
        repoInput,
        branch,
        token,
        styleSlug,
        styleName,
        styleJson,
        spriteJson,
        spritePng,
        sprite2xJson,
        sprite2xPng
      });

      expect(result.alreadyPublished).toBe(true);
      expect(fetchSpy.mock.calls.some(([url, init]) =>
        String(url).includes('/git/blobs') && (init?.method || 'GET').toUpperCase() === 'POST'
      )).toBe(false);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('creates commit when any target blob differs', async () => {
    let blobCounter = 0;
    let commitCounter = 0;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method || 'GET').toUpperCase();

      if (method === 'GET' && url.includes('/git/ref/heads/')) {
        return new Response(JSON.stringify({ object: { sha: 'head-sha' } }), { status: 200 });
      }

      if (method === 'GET' && url.includes('/git/commits/')) {
        return new Response(JSON.stringify({ tree: { sha: 'tree-sha' } }), { status: 200 });
      }

      if (method === 'GET' && url.includes('/git/trees/tree-sha?recursive=1')) {
        return new Response(JSON.stringify({ tree: [] }), { status: 200 });
      }

      if (method === 'POST' && url.endsWith('/git/blobs')) {
        blobCounter += 1;
        return new Response(JSON.stringify({ sha: `blob-${blobCounter}` }), { status: 201 });
      }

      if (method === 'POST' && url.endsWith('/git/trees')) {
        return new Response(JSON.stringify({ sha: 'new-tree' }), { status: 201 });
      }

      if (method === 'POST' && url.endsWith('/git/commits')) {
        commitCounter += 1;
        return new Response(JSON.stringify({ sha: `new-commit-${commitCounter}` }), { status: 201 });
      }

      if (method === 'PATCH' && url.includes('/git/refs/heads/')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }

      return new Response(JSON.stringify({ message: `Unexpected ${method} ${url}` }), { status: 500 });
    });

    try {
      const result = await GitHubPagesPublisher.publish({
        repoInput,
        branch,
        token,
        styleSlug,
        styleName,
        styleJson,
        spriteJson,
        spritePng,
        sprite2xJson,
        sprite2xPng
      });

      expect(result.alreadyPublished).toBe(false);
      expect(blobCounter).toBe(5);
      expect(commitCounter).toBe(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
