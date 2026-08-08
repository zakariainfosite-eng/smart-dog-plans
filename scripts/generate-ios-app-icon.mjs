#!/usr/bin/env node
/**
 * Generate iOS AppIcon.appiconset from the official CynoPlanning logo.
 *
 * Source: assets/cynoplanning-logo-source.png (same master as Electron icons)
 * Output: ios/App/App/Assets.xcassets/AppIcon.appiconset/
 *
 * Survives `npx cap sync ios` (Assets.xcassets is not overwritten by Cap sync).
 * Does not touch in-app UI logos (public/logo.png, Splash, etc.).
 */
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_CANDIDATES = [
  join(root, "assets", "cynoplanning-logo-source.png"),
  join(root, "assets", "icon.png"),
];
const OUT_DIR = join(root, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset");

const LOGO_COVERAGE = 0.77;
const BLACK_THRESHOLD = 36;
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * Classic iPhone/iPad + App Store marketing sizes.
 * Use distinct -iphone/-ipad filename suffixes so @2x/@3x slots never collide
 * on case-insensitive or path-aliased volumes (seen with Icon-App-40x40@2x.png).
 */
const ICON_ENTRIES = [
  { idiom: "iphone", size: "20x20", scale: "2x", px: 40, file: "Icon-App-20x20@2x-iphone.png" },
  { idiom: "iphone", size: "20x20", scale: "3x", px: 60, file: "Icon-App-20x20@3x-iphone.png" },
  { idiom: "iphone", size: "29x29", scale: "2x", px: 58, file: "Icon-App-29x29@2x-iphone.png" },
  { idiom: "iphone", size: "29x29", scale: "3x", px: 87, file: "Icon-App-29x29@3x-iphone.png" },
  { idiom: "iphone", size: "40x40", scale: "2x", px: 80, file: "Icon-App-40x40@2x-iphone.png" },
  { idiom: "iphone", size: "40x40", scale: "3x", px: 120, file: "Icon-App-40x40@3x-iphone.png" },
  { idiom: "iphone", size: "60x60", scale: "2x", px: 120, file: "Icon-App-60x60@2x-iphone.png" },
  { idiom: "iphone", size: "60x60", scale: "3x", px: 180, file: "Icon-App-60x60@3x-iphone.png" },
  { idiom: "ipad", size: "20x20", scale: "1x", px: 20, file: "Icon-App-20x20@1x.png" },
  { idiom: "ipad", size: "20x20", scale: "2x", px: 40, file: "Icon-App-20x20@2x-ipad.png" },
  { idiom: "ipad", size: "29x29", scale: "1x", px: 29, file: "Icon-App-29x29@1x.png" },
  { idiom: "ipad", size: "29x29", scale: "2x", px: 58, file: "Icon-App-29x29@2x-ipad.png" },
  { idiom: "ipad", size: "40x40", scale: "1x", px: 40, file: "Icon-App-40x40@1x.png" },
  { idiom: "ipad", size: "40x40", scale: "2x", px: 80, file: "Icon-App-40x40@2x-ipad.png" },
  { idiom: "ipad", size: "76x76", scale: "1x", px: 76, file: "Icon-App-76x76@1x.png" },
  { idiom: "ipad", size: "76x76", scale: "2x", px: 152, file: "Icon-App-76x76@2x.png" },
  { idiom: "ipad", size: "83.5x83.5", scale: "2x", px: 167, file: "Icon-App-83.5x83.5@2x.png" },
  { idiom: "ios-marketing", size: "1024x1024", scale: "1x", px: 1024, file: "AppIcon-1024.png" },
];

function findSource() {
  for (const path of SOURCE_CANDIDATES) {
    if (existsSync(path)) return path;
  }
  return null;
}

async function extractLogoOnTransparent(sourceBuffer) {
  const { data, info } = await sharp(sourceBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD) {
      data[i + 3] = 0;
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim({ threshold: 8 })
    .png()
    .toBuffer();
}

async function composeIcon(logoBuffer, size) {
  const logoBox = Math.max(1, Math.round(size * LOGO_COVERAGE));
  const resizedLogo = await sharp(logoBuffer)
    .resize(logoBox, logoBox, {
      fit: "contain",
      background: TRANSPARENT,
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  let pipeline = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: WHITE,
    },
  }).composite([{ input: resizedLogo, gravity: "centre" }]);

  if (size <= 32) {
    pipeline = pipeline.sharpen({ sigma: 0.6, m1: 0.5, m2: 2.5 });
  }

  // Opaque RGB — iOS Home Screen / App Store reject transparent app icons.
  return pipeline
    .flatten({ background: WHITE })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function clearGeneratedPngs() {
  if (!existsSync(OUT_DIR)) return;
  for (const name of readdirSync(OUT_DIR)) {
    if (name.toLowerCase().endsWith(".png")) {
      unlinkSync(join(OUT_DIR, name));
    }
  }
}

async function main() {
  const sourcePath = findSource();
  if (!sourcePath) {
    console.error("Missing source logo. Expected assets/cynoplanning-logo-source.png");
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  clearGeneratedPngs();

  console.log(`Generating iOS AppIcon from ${sourcePath}`);
  const sourceBuffer = await sharp(sourcePath).rotate().toBuffer();
  const logoBuffer = await extractLogoOnTransparent(sourceBuffer);

  const images = [];
  for (const entry of ICON_ENTRIES) {
    const buffer = await composeIcon(logoBuffer, entry.px);
    writeFileSync(join(OUT_DIR, entry.file), buffer);
    images.push({
      filename: entry.file,
      idiom: entry.idiom,
      scale: entry.scale,
      size: entry.size,
    });
    console.log(`  ✓ ${entry.file} (${entry.px}×${entry.px})`);
  }

  writeFileSync(
    join(OUT_DIR, "Contents.json"),
    `${JSON.stringify({ images, info: { author: "xcode", version: 1 } }, null, 2)}\n`,
  );
  console.log("  ✓ Contents.json");
  console.log("Done. App target already uses ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
