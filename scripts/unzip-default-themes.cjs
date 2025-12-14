#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createGunzip } = require('zlib');

const rootDir = process.cwd();
const sourcePath = path.join(rootDir, 'default-themes.json.gz');
const publicDir = path.join(rootDir, 'public');
const targetPath = path.join(publicDir, 'default-themes.json');
const gzTargetPath = path.join(publicDir, 'default-themes.json.gz');

if (!fs.existsSync(sourcePath)) {
  console.warn('[prepare-default-themes] default-themes.json.gz not found, skipping extraction.');
  process.exit(0);
}

fs.mkdirSync(publicDir, { recursive: true });
fs.copyFileSync(sourcePath, gzTargetPath);

if (fs.existsSync(targetPath)) {
  fs.unlinkSync(targetPath);
}

if (process.env.EXTRACT_DEFAULT_THEMES === 'true') {
  const sourceStat = fs.statSync(sourcePath);
  const targetStat = fs.existsSync(targetPath) ? fs.statSync(targetPath) : null;

  if (targetStat && targetStat.mtimeMs >= sourceStat.mtimeMs) {
    console.log('[prepare-default-themes] Default themes already extracted.');
    process.exit(0);
  }

  console.log('[prepare-default-themes] Extracting default themes...');

  const readStream = fs.createReadStream(sourcePath);
  const writeStream = fs.createWriteStream(targetPath);

  const handleError = (err) => {
    console.error('[prepare-default-themes] Extraction failed:', err);
    try { fs.unlinkSync(targetPath); } catch (e) { /* ignore */ }
    process.exit(1);
  };

  readStream.on('error', handleError);
  writeStream.on('error', handleError);
  writeStream.on('finish', () => {
    console.log('[prepare-default-themes] Extraction complete.');
  });

  readStream.pipe(createGunzip()).pipe(writeStream);
} else {
  console.log('[prepare-default-themes] Skipping extraction; serving gzip asset.');
}
