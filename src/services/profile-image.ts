import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { env } from "../config/env";

const allowedContentTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp"
};

type ProfileImageRow = {
  image_key: string;
  extension: string;
  content_type: string;
  data: Buffer;
};

const databasePath = path.resolve(env.imageSqlite.path);
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

let database: DatabaseSync | undefined;

const getDatabase = () => {
  if (!database) {
    database = new DatabaseSync(databasePath);
    database.exec("PRAGMA journal_mode = WAL");
    database.exec(`
      CREATE TABLE IF NOT EXISTS profile_images (
        image_key TEXT NOT NULL PRIMARY KEY,
        email TEXT NOT NULL,
        extension TEXT NOT NULL,
        content_type TEXT NOT NULL,
        data BLOB NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  return database;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const createProfileImageKey = (email: string) =>
  crypto.createHash("sha1").update(normalizeEmail(email)).digest("hex");

export const getProfileImageExtension = (contentType: string) =>
  allowedContentTypes[contentType.split(";")[0].trim().toLowerCase()] ?? null;

const inferProfileImageType = (data: Buffer) => {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return { contentType: "image/png", extension: "png" };
  }
  if (data.length >= 6 && (data.subarray(0, 6).toString("ascii") === "GIF87a" || data.subarray(0, 6).toString("ascii") === "GIF89a")) {
    return { contentType: "image/gif", extension: "gif" };
  }
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
};

export const getProfileImageUrl = (imageKey: string, extension: string) => `/image/${imageKey}.${extension}`;

export const saveProfileImage = (email: string, contentType: string, data: Buffer) => {
  const normalizedContentType = contentType.split(";")[0].trim().toLowerCase();
  const detectedType =
    getProfileImageExtension(normalizedContentType) !== null
      ? { contentType: normalizedContentType, extension: getProfileImageExtension(normalizedContentType)! }
      : inferProfileImageType(data);
  if (!detectedType) {
    return null;
  }

  const imageKey = createProfileImageKey(email);
  getDatabase()
    .prepare(
      `
        INSERT INTO profile_images (image_key, email, extension, content_type, data, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(image_key) DO UPDATE SET
          email = excluded.email,
          extension = excluded.extension,
          content_type = excluded.content_type,
          data = excluded.data,
          updated_at = CURRENT_TIMESTAMP
      `
    )
    .run(imageKey, normalizeEmail(email), detectedType.extension, detectedType.contentType, data);

  return { imageKey, extension: detectedType.extension, profileImageUrl: getProfileImageUrl(imageKey, detectedType.extension) };
};

export const deleteProfileImage = (email: string) => {
  const imageKey = createProfileImageKey(email);
  getDatabase().prepare("DELETE FROM profile_images WHERE image_key = ?").run(imageKey);
};

export const findProfileImageByFile = (imageKey: string, extension: string) => {
  return getDatabase()
    .prepare("SELECT image_key, extension, content_type, data FROM profile_images WHERE image_key = ? AND extension = ?")
    .get(imageKey, extension) as ProfileImageRow | undefined;
};

export const findProfileImageMetaByEmail = (email: string) => {
  const imageKey = createProfileImageKey(email);
  const row = getDatabase()
    .prepare("SELECT extension FROM profile_images WHERE image_key = ?")
    .get(imageKey) as { extension: string } | undefined;

  return row ? { imageKey, extension: row.extension, profileImageUrl: getProfileImageUrl(imageKey, row.extension) } : null;
};
