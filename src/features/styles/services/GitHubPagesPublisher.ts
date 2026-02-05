import { createLogger } from '@core/logger';

const logger = createLogger('GitHubPagesPublisher');

export type GitHubRepo = {
  owner: string;
  repo: string;
};

export type GitHubPublishResult = {
  spriteBaseUrl: string;
  styleUrl: string;
};

export type GitHubPublishPaths = {
  spriteBasePath: string;
  spriteJsonPath: string;
  spritePngPath: string;
  sprite2xJsonPath: string;
  sprite2xPngPath: string;
  styleJsonPath: string;
  stylePublicPath: string;
};

export type GitHubFilePayload = {
  path: string;
  content: Blob | string;
};

const GITHUB_API_BASE = 'https://api.github.com';

export const parseGitHubRepo = (input: string): GitHubRepo | null => {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const normalized = trimmed
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  const [owner, repo] = normalized.split('/');
  if (!owner || !repo) return null;

  return { owner, repo };
};

export const buildPagesBaseUrl = (owner: string, repo: string): string => {
  if (repo.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
    return `https://${owner}.github.io`;
  }

  return `https://${owner}.github.io/${repo}`;
};

export const buildPublishPaths = (styleSlug: string): GitHubPublishPaths => {
  const safeSlug = styleSlug || 'map-style';
  const spriteBasePath = `sprites/${safeSlug}`;
  const repoPrefix = 'public';
  const stylePublicPath = `styles/${safeSlug}.json`;

  return {
    spriteBasePath,
    spriteJsonPath: `${repoPrefix}/${spriteBasePath}.json`,
    spritePngPath: `${repoPrefix}/${spriteBasePath}.png`,
    sprite2xJsonPath: `${repoPrefix}/${spriteBasePath}@2x.json`,
    sprite2xPngPath: `${repoPrefix}/${spriteBasePath}@2x.png`,
    styleJsonPath: `${repoPrefix}/${stylePublicPath}`,
    stylePublicPath
  };
};

const base64FromArrayBuffer = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }

  return btoa(binary);
};

const toBase64 = async (data: Blob | string): Promise<string> => {
  if (typeof data === 'string') {
    const encoded = new TextEncoder().encode(data);
    return base64FromArrayBuffer(encoded.buffer);
  }

  const buffer = await data.arrayBuffer();
  return base64FromArrayBuffer(buffer);
};

const request = async (url: string, token: string, init?: RequestInit) => {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {})
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }

  return res;
};

const encodePath = (path: string) =>
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

type GitTreeEntry = {
  path: string;
  mode: '100644';
  type: 'blob';
  sha: string;
};

export const buildTreeEntries = (blobs: Array<{ path: string; sha: string }>): GitTreeEntry[] => {
  return blobs.map(({ path, sha }) => ({
    path,
    mode: '100644',
    type: 'blob',
    sha
  }));
};

const getBranchHeadSha = async (repo: GitHubRepo, branch: string, token: string): Promise<string> => {
  const url = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.repo}/git/ref/heads/${encodeURIComponent(branch)}`;
  const res = await request(url, token);
  const json = await res.json();
  const sha = json?.object?.sha as string | undefined;
  if (!sha) {
    throw new Error(`Unable to resolve branch ${branch} head SHA.`);
  }
  return sha;
};

const getCommitTreeSha = async (repo: GitHubRepo, commitSha: string, token: string): Promise<string> => {
  const url = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.repo}/git/commits/${encodeURIComponent(commitSha)}`;
  const res = await request(url, token);
  const json = await res.json();
  const sha = json?.tree?.sha as string | undefined;
  if (!sha) {
    throw new Error('Unable to resolve base tree SHA.');
  }
  return sha;
};

const createBlob = async (repo: GitHubRepo, token: string, content: Blob | string): Promise<string> => {
  const url = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.repo}/git/blobs`;
  const res = await request(url, token, {
    method: 'POST',
    body: JSON.stringify({
      content: await toBase64(content),
      encoding: 'base64'
    })
  });
  const json = await res.json();
  const sha = json?.sha as string | undefined;
  if (!sha) throw new Error('Failed to create blob.');
  return sha;
};

const createTree = async (
  repo: GitHubRepo,
  token: string,
  baseTreeSha: string,
  entries: GitTreeEntry[]
): Promise<string> => {
  const url = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.repo}/git/trees`;
  const res = await request(url, token, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: entries
    })
  });
  const json = await res.json();
  const sha = json?.sha as string | undefined;
  if (!sha) throw new Error('Failed to create tree.');
  return sha;
};

const createCommit = async (
  repo: GitHubRepo,
  token: string,
  message: string,
  treeSha: string,
  parentSha: string
): Promise<string> => {
  const url = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.repo}/git/commits`;
  const res = await request(url, token, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha]
    })
  });
  const json = await res.json();
  const sha = json?.sha as string | undefined;
  if (!sha) throw new Error('Failed to create commit.');
  return sha;
};

const updateBranchRef = async (
  repo: GitHubRepo,
  token: string,
  branch: string,
  commitSha: string
) => {
  const url = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.repo}/git/refs/heads/${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commitSha, force: false }),
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`
    }
  });

  if (res.ok) return;
  const text = await res.text();
  throw new Error(`GitHub API error ${res.status}: ${text}`);
};

const commitFiles = async (params: {
  repo: GitHubRepo;
  branch: string;
  token: string;
  message: string;
  files: GitHubFilePayload[];
}) => {
  const { repo, branch, token, message, files } = params;
  const blobs = await Promise.all(
    files.map(async (file) => ({
      path: file.path,
      sha: await createBlob(repo, token, file.content)
    }))
  );

  const entries = buildTreeEntries(blobs);

  const attemptCommit = async (parentSha: string) => {
    const baseTreeSha = await getCommitTreeSha(repo, parentSha, token);
    const treeSha = await createTree(repo, token, baseTreeSha, entries);
    const commitSha = await createCommit(repo, token, message, treeSha, parentSha);
    await updateBranchRef(repo, token, branch, commitSha);
    return commitSha;
  };

  const firstParent = await getBranchHeadSha(repo, branch, token);

  try {
    await attemptCommit(firstParent);
  } catch (error) {
    const secondParent = await getBranchHeadSha(repo, branch, token);
    if (secondParent === firstParent) throw error;
    await attemptCommit(secondParent);
  }
};

export const GitHubPagesPublisher = {
  buildPagesBaseUrl,
  buildPublishPaths,
  parseGitHubRepo,
  async publish(params: {
    repoInput: string;
    branch: string;
    token: string;
    styleSlug: string;
    styleName: string;
    styleJson: Record<string, unknown>;
    spriteJson: Record<string, unknown>;
    spritePng: Blob;
    sprite2xJson: Record<string, unknown>;
    sprite2xPng: Blob;
  }): Promise<GitHubPublishResult> {
    const repo = parseGitHubRepo(params.repoInput);
    if (!repo) {
      throw new Error('Invalid GitHub repository. Use owner/repo format.');
    }

    const baseUrl = buildPagesBaseUrl(repo.owner, repo.repo);
    const paths = buildPublishPaths(params.styleSlug);
    const message = `chore: publish maputnik assets for ${params.styleName}`;

    await commitFiles({
      repo,
      branch: params.branch,
      token: params.token,
      message,
      files: [
        { path: paths.spriteJsonPath, content: JSON.stringify(params.spriteJson, null, 2) },
        { path: paths.spritePngPath, content: params.spritePng },
        { path: paths.sprite2xJsonPath, content: JSON.stringify(params.sprite2xJson, null, 2) },
        { path: paths.sprite2xPngPath, content: params.sprite2xPng },
        { path: paths.styleJsonPath, content: JSON.stringify(params.styleJson, null, 2) }
      ]
    });

    const spriteBaseUrl = `${baseUrl}/${paths.spriteBasePath}`;
    const styleUrl = `${baseUrl}/${paths.stylePublicPath}`;

    logger.info(`Published Maputnik assets to ${styleUrl}`);

    return { spriteBaseUrl, styleUrl };
  }
};
