import { test as bddTest } from 'playwright-bdd';

type BddDataEntry = {
  pwTestLine: number;
};

// Workaround for occasional Playwright location mismatch where testInfo.line
// points to a nearby line (e.g. describe block) instead of test(...) line.
// Prefer exact match; otherwise use nearest generated test line.
export const test = bddTest.extend({
  $bddTestData: [
    async ({ $bddFileData }, use, testInfo) => {
      const fileData = ($bddFileData || []) as BddDataEntry[];
      let bddTestData = fileData.find((data) => data.pwTestLine === testInfo.line);

      if (!bddTestData && fileData.length > 0) {
        bddTestData = [...fileData].sort(
          (a, b) => Math.abs(a.pwTestLine - testInfo.line) - Math.abs(b.pwTestLine - testInfo.line)
        )[0];
      }

      await use(bddTestData);
    },
    { scope: 'test', box: true } as { scope: 'test'; box: true },
  ],
});
