#!/usr/bin/env node
import { App, Tags } from 'aws-cdk-lib';
import { config } from '../lib/config';
import { ServerlessStack, StackType } from '../lib/main-stack';

const app = new App();

const stackType = (app.node.tryGetContext('stackType') as StackType | undefined) ?? 'prod';
const branchStage = app.node.tryGetContext('stage') as string | undefined;

const stage = stackType === 'prod' ? 'production' : stackType === 'dev' ? 'dev' : branchStage!;
const stackId =
  stackType === 'prod'
    ? config.stackName
    : stackType === 'dev'
      ? `${config.stackName}-dev`
      : `${config.stackName}-${stage}`;

const stack = new ServerlessStack(app, stackId, {
  stackType,
  stage,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? process.env.AWS_ACCOUNT_ID,
    region: config.deploymentRegion,
  },
});

Tags.of(stack).add('Project', config.stackName);
Tags.of(stack).add('Stage', stage);
Tags.of(stack).add('ManagedBy', 'aws-cdk');
