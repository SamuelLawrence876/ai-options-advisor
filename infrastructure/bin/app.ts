#!/usr/bin/env node
import { App, Tags } from 'aws-cdk-lib';
import { config } from '../lib/config';
import { OptionsAnalysisStack, StackType } from '../lib/main-stack';

const app = new App();

const stackType = (app.node.tryGetContext('stackType') as StackType | undefined) ?? 'prod';
const stage = stackType === 'prod' ? 'production' : 'dev';
const stackId = stackType === 'prod' ? config.stackName : `${config.stackName}-dev`;

const stack = new OptionsAnalysisStack(app, stackId, {
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
