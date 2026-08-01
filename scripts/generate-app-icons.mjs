#!/usr/bin/env node
/**
 * Generate all Electron Builder icons from the official CynoPlanning logo.
 *
 * Source: assets/cynoplanning-logo-source.png (or assets/icon.png)
 * Output under build/:
 *   icon.png (1024), icon-512/256/128/64/48/32/16.png
 *   icon.ico  — Windows multi-resolution (16, 24, 32, 48, 64, 128, 256)
 *   icon.icns — macOS
 *
 * Design:
 *   - Clean white background
 *   - Logo centered at ~77% of the canvas (comfortable margins)
 *   - Original blue/gray colors preserved
 *   - No shadows, gradients, or decorative effects
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";
import * as png2icons from "png2icons";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "build");

const SOURCE_CANDIDATES = [
  join(root, "assets", "cynoplanning-logo-source.png"),
  join(root, "assets", "icon.png"),
  join(root, "build", "icon.png"),
];

const PNG_SIZES = [1024, 512, 256, 128, 64, 48, 32, 16];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** Logo occupies ~77% of the icon (margins ~11.5% each side). */
const LOGO_COVERAGE = 0.77;

/** Pixels darker than this (all channels) become transparent (black canvas). */
const BLACK_THRESHOLD = 36;

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

function findSource() {
  for (const path of SOURCE_CANDIDATES) {
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Remove near-black background, keep logo colors, trim to content bounds.
 */
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
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .trim({ threshold: 8 })
    .png()
    .toBuffer();
}

/**
 * Place the trimmed logo centered on a white square at LOGO_COVERAGE scale.
 * Small sizes get a light sharpen pass for readability.
 */
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

  return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

async function writePngVariants(logoBuffer) {
  const outputs = {};

  for (const size of PNG_SIZES) {
    const buffer = await composeIcon(logoBuffer, size);
    const name = size === 1024 ? "icon.png" : `icon-${size}.png`;
    writeFileSync(join(buildDir, name), buffer);
    outputs[size] = buffer;
    console.log(`  ✓ ${name} (${size}×${size})`);
  }

  writeFileSync(join(root, "assets", "icon.png"), outputs[1024]);
  console.log("  ✓ assets/icon.png (1024×1024 master)");

  return outputs;
}

async function writeIco(pngBySize, logoBuffer) {
  const icoBuffers = [];
  for (const size of ICO_SIZES) {
    if (pngBySize[size]) {
      icoBuffers.push(pngBySize[size]);
    } else {
      icoBuffers.push(await composeIcon(logoBuffer, size));
    }
  }

  const ico = await pngToIco(icoBuffers);
  const out = join(buildDir, "icon.ico");
  writeFileSync(out, ico);
  console.log(`  ✓ icon.ico (sizes: ${ICO_SIZES.join(", ")})`);
  return out;
}

function writeIcns(masterPng1024) {
  const icns = png2icons.createICNS(masterPng1024, png2icons.BILINEAR, 0);
  if (!icns) {
    throw new Error("png2icons.createICNS failed");
  }
  const out = join(buildDir, "icon.icns");
  writeFileSync(out, icns);
  console.log("  ✓ icon.icns");
  return out;
}

async function main() {
  const sourcePath = findSource();
  if (!sourcePath) {
    console.error(
      "Missing source logo. Expected assets/cynoplanning-logo-source.png or assets/icon.png",
    );
    process.exit(1);
  }

  mkdirSync(buildDir, { recursive: true });
  mkdirSync(join(root, "assets"), { recursive: true });

  console.log(`Generating icons from ${sourcePath}`);
  console.log(
    `Style: white background, logo coverage ${(LOGO_COVERAGE * 100).toFixed(0)}%, centered`,
  );

  const sourceBuffer = await sharp(sourcePath).rotate().toBuffer();
  const logoBuffer = await extractLogoOnTransparent(sourceBuffer);

  console.log("PNG sizes:");
  const pngBySize = await writePngVariants(logoBuffer);

  pngBySize[24] = await composeIcon(logoBuffer, 24);

  console.log("Windows ICO:");
  await writeIco(pngBySize, logoBuffer);

  console.log("macOS ICNS:");
  writeIcns(pngBySize[1024]);

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
