import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export interface S3Config {
  endpoint: string
  bucket: string
  accessKey: string
  secretKey: string
  region: string
}

export function createS3Service(config: S3Config) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: true, // required for some S3-compatible providers
  })

  return {
    async presignUpload(key: string, expiresIn = 3600): Promise<string> {
      const command = new PutObjectCommand({ Bucket: config.bucket, Key: key })
      return getSignedUrl(client, command, { expiresIn })
    },

    async presignDownload(key: string, expiresIn = 3600): Promise<string> {
      const command = new GetObjectCommand({ Bucket: config.bucket, Key: key })
      return getSignedUrl(client, command, { expiresIn })
    },

    async listObjects(prefix: string): Promise<Array<{ key: string; size: number; lastModified: string }>> {
      const results: Array<{ key: string; size: number; lastModified: string }> = []
      let continuationToken: string | undefined

      do {
        const command = new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
        const response = await client.send(command)
        for (const obj of response.Contents ?? []) {
          if (obj.Key && obj.Size !== undefined && obj.LastModified) {
            results.push({
              key: obj.Key,
              size: obj.Size,
              lastModified: obj.LastModified.toISOString(),
            })
          }
        }
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
      } while (continuationToken)

      return results
    },
  }
}

export type S3Service = ReturnType<typeof createS3Service>
