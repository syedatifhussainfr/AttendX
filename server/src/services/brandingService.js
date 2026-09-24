import crypto from "node:crypto";
import { BrandingAsset, Setting, sequelize } from "../db/index.js";

export const MAX_BRAND_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 12_000_000;
const MIN_DIMENSION = 32;

function settingValue(row, fallback) {
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

function invalid(message, status = 415) {
  return Object.assign(new Error(message), { status });
}

function pngDimensions(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) return null;
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  let offset = 8;
  let hasImageData = false;
  let hasEnd = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) throw invalid("The PNG file is truncated or malformed.");
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") hasImageData = true;
    if (type === "IEND") {
      hasEnd = true;
      break;
    }
    offset = end;
  }
  if (!hasImageData || !hasEnd) throw invalid("The PNG file is incomplete.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  if (buffer.at(-2) !== 0xff || buffer.at(-1) !== 0xd9)
    throw invalid("The JPEG file is incomplete.");
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length)
      throw invalid("The JPEG file is truncated or malformed.");
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker))
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    offset += length;
  }
  throw invalid("The JPEG does not contain readable dimensions.");
}

export function inspectBrandImage(file) {
  if (!file?.buffer?.length) throw invalid("Choose a non-empty logo file.", 400);
  if (file.size > MAX_BRAND_IMAGE_BYTES)
    throw invalid("Logo files must be 2 MB or smaller.", 413);
  const extension = file.originalname.toLowerCase().match(/\.(png|jpe?g)$/)?.[1];
  if (!extension) throw invalid("Only .png, .jpg, and .jpeg logo files are allowed.");
  let dimensions;
  let mimeType;
  if (extension === "png") {
    dimensions = pngDimensions(file.buffer);
    mimeType = "image/png";
  } else {
    dimensions = jpegDimensions(file.buffer);
    mimeType = "image/jpeg";
  }
  if (!dimensions)
    throw invalid("The file content does not match its image extension.");
  if (file.mimetype !== mimeType)
    throw invalid("The file MIME type does not match its image content.");
  const { width, height } = dimensions;
  if (
    width < MIN_DIMENSION ||
    height < MIN_DIMENSION ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION ||
    width * height > MAX_PIXELS
  )
    throw invalid(
      "Logo dimensions must be 32–4096 px per side and below 12 megapixels.",
      422,
    );
  return {
    mimeType,
    originalName: file.originalname,
    byteSize: file.size,
    width,
    height,
    checksum: crypto.createHash("sha256").update(file.buffer).digest("hex"),
    data: file.buffer,
  };
}

export async function brandingSnapshot() {
  const [settings, assets] = await Promise.all([
    Setting.findAll({
      where: {
        key: [
          "institutionName",
          "institutionCode",
          "campusName",
          "secondaryLogoEnabled",
        ],
      },
    }),
    BrandingAsset.findAll({ attributes: { exclude: ["data"] } }),
  ]);
  const values = Object.fromEntries(settings.map((row) => [row.key, settingValue(row)]));
  const primary = assets.find((asset) => asset.slot === "PRIMARY");
  const secondary = assets.find((asset) => asset.slot === "SECONDARY");
  const favicon = assets.find((asset) => asset.slot === "FAVICON");
  const secondaryEnabled = values.secondaryLogoEnabled !== false;
  return {
    institutionName: values.institutionName || "EIILM Kolkata",
    institutionCode: values.institutionCode || "EIILM",
    campusName: values.campusName || "",
    primaryLogoUrl: primary
      ? `/api/branding/logo/primary?v=${primary.checksum.slice(0, 12)}`
      : "/brand/eiilm.png",
    secondaryLogoUrl: secondaryEnabled
      ? secondary
        ? `/api/branding/logo/secondary?v=${secondary.checksum.slice(0, 12)}`
        : "/brand/ekcle.png"
      : null,
    faviconUrl: favicon
      ? `/api/branding/logo/favicon?v=${favicon.checksum.slice(0, 12)}`
      : primary
        ? `/api/branding/logo/primary?v=${primary.checksum.slice(0, 12)}`
        : "/brand/eiilm.png",
    assets: {
      primary: primary
        ? { name: primary.originalName, size: primary.byteSize, width: primary.width, height: primary.height }
        : null,
      secondary: secondary
        ? { name: secondary.originalName, size: secondary.byteSize, width: secondary.width, height: secondary.height }
        : null,
      favicon: favicon
        ? { name: favicon.originalName, size: favicon.byteSize, width: favicon.width, height: favicon.height }
        : null,
    },
  };
}

export async function updateBranding({
  profile,
  primaryFile,
  secondaryFile,
  faviconFile,
  removeSecondary,
  removeFavicon,
}) {
  const primary = primaryFile ? inspectBrandImage(primaryFile) : null;
  const secondary = secondaryFile ? inspectBrandImage(secondaryFile) : null;
  const favicon = faviconFile ? inspectBrandImage(faviconFile) : null;
  await sequelize.transaction(async (transaction) => {
    for (const [key, value] of Object.entries(profile))
      await Setting.upsert({ key, value: JSON.stringify(value) }, { transaction });
    if (primary)
      await BrandingAsset.upsert({ slot: "PRIMARY", ...primary }, { transaction });
    if (secondary)
      await BrandingAsset.upsert({ slot: "SECONDARY", ...secondary }, { transaction });
    if (favicon)
      await BrandingAsset.upsert({ slot: "FAVICON", ...favicon }, { transaction });
    if (removeSecondary) await BrandingAsset.destroy({ where: { slot: "SECONDARY" }, transaction });
    if (removeFavicon) await BrandingAsset.destroy({ where: { slot: "FAVICON" }, transaction });
    if (secondary || removeSecondary)
      await Setting.upsert(
        { key: "secondaryLogoEnabled", value: JSON.stringify(Boolean(secondary)) },
        { transaction },
      );
  });
  return brandingSnapshot();
}
