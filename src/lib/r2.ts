import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

let client: S3Client | undefined;

export function getR2BucketName(): string {
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (!bucket) {
    throw new Error(
      "R2_BUCKET_NAME is not set — add it to .env (see .env.example)."
    );
  }
  return bucket;
}

export function getPublicR2BaseUrl(): string {
  const base = process.env.PUBLIC_R2_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) {
    throw new Error(
      "PUBLIC_R2_BASE_URL is not set — add it to .env (see .env.example)."
    );
  }
  return base;
}

/** Build public HTTPS URL for an R2 object key. */
export function publicUrl(key: string): string {
  const base = getPublicR2BaseUrl();
  const normalized = key.replace(/^\//, "");
  return `${base}/${normalized}`;
}

export function getR2Client(): S3Client {
  if (client) return client;
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials missing — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env (see .env.example)."
    );
  }
  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

export async function objectExists(
  key: string,
  bucket = getR2BucketName()
): Promise<boolean> {
  try {
    await getR2Client().send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );
    return true;
  } catch (err: unknown) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

export type UploadStatus = "uploaded" | "skipped-exists";

export async function uploadPdf(options: {
  key: string;
  filePath: string;
  force?: boolean;
  bucket?: string;
}): Promise<{ key: string; status: UploadStatus }> {
  const bucket = options.bucket ?? getR2BucketName();
  const { key, filePath, force = false } = options;

  if (!force && (await objectExists(key, bucket))) {
    return { key, status: "skipped-exists" };
  }

  const { size } = await stat(filePath);
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: "application/pdf",
      ContentLength: size,
    })
  );
  return { key, status: "uploaded" };
}

/** R2 key for a local originals filename (basename only). */
export function originalsObjectKey(filename: string): string {
  return `originals/${pathBasename(filename)}`;
}

function pathBasename(filename: string): string {
  const parts = filename.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? filename;
}

/** Lecture id prefix from originals filename, or null. */
export function parseOriginalsLectureId(filename: string): string | null {
  const base = pathBasename(filename);
  const m = base.match(/^(\d{8}[a-g]?)_/i);
  return m?.[1]?.toLowerCase() ?? null;
}
