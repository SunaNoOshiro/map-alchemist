import { createBdd } from 'playwright-bdd';
import { expect, Page } from '@playwright/test';

const { Given, When, Then } = createBdd();

let dialogEvents: string[] = [];

const mockGitHubApiForPublish = async (page: Page) => {
  let blobCounter = 0;
  let sequence = 0;
  let branchHeadSha = 'commit-head-1';

  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = request.url();
    const fulfillJson = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body)
      });

    if (method === 'GET' && url.includes('/git/ref/heads/')) {
      return fulfillJson({ object: { sha: branchHeadSha } });
    }

    if (method === 'GET' && url.includes('/git/commits/')) {
      const commitPath = url.split('/git/commits/')[1] || '';
      const commitSha = decodeURIComponent(commitPath.split('?')[0] || branchHeadSha);
      return fulfillJson({ tree: { sha: `tree-for-${commitSha}` } });
    }

    if (method === 'POST' && url.endsWith('/git/blobs')) {
      blobCounter += 1;
      return fulfillJson({ sha: `blob-${blobCounter}` }, 201);
    }

    if (method === 'POST' && url.endsWith('/git/trees')) {
      sequence += 1;
      return fulfillJson({ sha: `tree-created-${sequence}` }, 201);
    }

    if (method === 'POST' && url.endsWith('/git/commits')) {
      sequence += 1;
      const nextSha = `commit-created-${sequence}`;
      return fulfillJson({ sha: nextSha }, 201);
    }

    if (method === 'PATCH' && url.includes('/git/refs/heads/')) {
      const rawBody = request.postData() || '{}';
      try {
        const parsed = JSON.parse(rawBody) as { sha?: string };
        if (typeof parsed.sha === 'string' && parsed.sha.trim().length > 0) {
          branchHeadSha = parsed.sha.trim();
        }
      } catch (_error) {
        // Ignore parse errors in tests and keep default SHA.
      }
      return fulfillJson({});
    }

    return fulfillJson({ message: 'Not mocked in BDD test' }, 404);
  });
};

Given('GitHub publish settings are prefilled', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('mapAlchemistGithubRepo', 'SunaNoOshiro/map-alchemist');
    localStorage.setItem('mapAlchemistGithubBranch', 'codex/extend-style-config');
    localStorage.setItem('mapAlchemistGithubToken', 'bdd-test-token');
    localStorage.setItem('mapAlchemistMaputnikDemoPois', 'true');
  });
});

Given('browser dialogs are tracked', async ({ page }) => {
  dialogEvents = [];
  page.on('dialog', async (dialog) => {
    dialogEvents.push(dialog.type());
    await dialog.dismiss();
  });
});

Given('GitHub API is mocked for publish success', async ({ page }) => {
  await mockGitHubApiForPublish(page);
});

When('I open the Maputnik publish modal', async ({ page }) => {
  await page.getByTitle('Publish to GitHub Pages (Maputnik)').click();
});

Then('the Maputnik publish modal should be fully visible in the viewport', async ({ page }) => {
  const modal = page.getByTestId('maputnik-publish-modal');
  await expect(modal).toBeVisible();

  const box = await modal.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;

  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 2);
});

Then('the demo POIs toggle should be visible', async ({ page }) => {
  const checkbox = page.getByRole('checkbox');
  await expect(checkbox).toBeVisible();
});

When('I publish assets from the Maputnik modal', async ({ page }) => {
  await page.getByRole('button', { name: 'Publish now' }).click();
  await expect(page.getByRole('heading', { name: 'Maputnik export published' })).toBeVisible({ timeout: 15000 });
});

Then('publish results should include style URL runtime URL and embed snippet', async ({ page }) => {
  const modal = page.getByTestId('maputnik-publish-modal');
  await expect(modal.getByText(/^Style URL$/i)).toBeVisible();
  await expect(modal.getByText(/^Runtime Script URL$/i)).toBeVisible();
  await expect(page.locator('pre')).toContainText('MapAlchemistRuntime.init');
  await expect(page.getByRole('button', { name: 'Copy snippet' })).toBeVisible();
  await expect(modal).toContainText(/runtime\/map-alchemist-runtime\.js/i);
});

Then('the publish modal content should be scrollable to the instructions block', async ({ page }) => {
  const content = page.getByTestId('maputnik-publish-modal-content');
  await expect(content).toBeVisible();

  const hasOverflow = await content.evaluate((element) => {
    const node = element as HTMLElement;
    return node.scrollHeight > node.clientHeight;
  });

  await content.evaluate((element) => {
    const node = element as HTMLElement;
    node.scrollTop = node.scrollHeight;
  });

  await expect(page.getByText('How to open in Maputnik')).toBeVisible();
  expect(hasOverflow).toBeTruthy();
});

Then('no browser dialogs should appear during publish', async () => {
  expect(dialogEvents).toEqual([]);
});
