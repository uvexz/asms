import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { AppError } from '../result'
import { getSetting } from '../settings'

type S3Config = {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

let cached: { key: string; client: S3Client; bucket: string } | null = null

export async function getS3Config(): Promise<S3Config> {
  const [
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
  ] = await Promise.all([
    getSetting('storage.s3.endpoint'),
    getSetting('storage.s3.region'),
    getSetting('storage.s3.bucket'),
    getSetting('storage.s3.accessKeyId'),
    getSetting('storage.s3.secretAccessKey'),
    getSetting('storage.s3.forcePathStyle'),
  ])

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
  }
}

export function isS3Configured(config: S3Config): boolean {
  return Boolean(config.bucket && config.accessKeyId && config.secretAccessKey)
}

async function getClient(): Promise<{ client: S3Client; bucket: string }> {
  const config = await getS3Config()
  if (!isS3Configured(config)) {
    throw new AppError('S3_NOT_CONFIGURED', '尚未配置对象存储')
  }

  const key = JSON.stringify(config)
  if (!cached || cached.key !== key) {
    cached = {
      key,
      bucket: config.bucket,
      client: new S3Client({
        region: config.region || 'auto',
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
        forcePathStyle: config.forcePathStyle,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      }),
    }
  }

  return { client: cached.client, bucket: cached.bucket }
}

export async function uploadObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const { client, bucket } = await getClient()
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

export async function getDownloadUrl(
  key: string,
  filename: string,
  expiresIn = 300,
): Promise<string> {
  const { client, bucket } = await getClient()
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    }),
    { expiresIn },
  )
}

const DELETE_BATCH_SIZE = 1000

async function deleteObjectBatches(keys: string[]): Promise<string[]> {
  const { client, bucket } = await getClient()
  const failed: string[] = []

  for (let offset = 0; offset < keys.length; offset += DELETE_BATCH_SIZE) {
    const batch = keys.slice(offset, offset + DELETE_BATCH_SIZE)
    const result = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: batch.map((key) => ({ Key: key })),
          Quiet: true,
        },
      }),
    )
    for (const error of result.Errors ?? []) {
      if (error.Key) failed.push(error.Key)
      console.error('[asms] delete object failed', error.Key, error.Code)
    }
  }

  return failed
}

/** Best effort: storage cleanup must not block deleting the database row. */
export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const config = await getS3Config()
  if (!isS3Configured(config)) return
  try {
    await deleteObjectBatches(keys)
  } catch (error) {
    console.error('[asms] delete object batch failed', error)
  }
}

/** Throws when storage still holds objects, so cleanup can retry next run. */
export async function deleteObjectsStrict(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const config = await getS3Config()
  if (!isS3Configured(config)) return
  const failed = await deleteObjectBatches(keys)
  if (failed.length > 0) {
    throw new Error(`[asms] ${failed.length} objects were not deleted`)
  }
}

export function resetS3Client() {
  cached = null
}
