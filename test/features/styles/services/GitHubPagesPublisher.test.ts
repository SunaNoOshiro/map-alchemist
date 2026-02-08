import { describe, expect, it } from 'vitest';
import {
  buildPagesBaseUrl,
  buildPublishPaths,
  parseGitHubRepo,
  buildTreeEntries
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
