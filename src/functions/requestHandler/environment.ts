export interface Environment {
  serviceName: string;
  stage: string;
  tableName: string;
  bucketName: string;
}

export const getEnvironment = (): Environment => ({
  serviceName: process.env.SERVICE_NAME ?? 'serverless-aws-template',
  stage: process.env.STAGE ?? 'local',
  tableName: process.env.TABLE_NAME ?? 'items-table',
  bucketName: process.env.BUCKET_NAME ?? '',
});
