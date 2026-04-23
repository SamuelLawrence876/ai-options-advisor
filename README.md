# serverless-aws-template

A production-ready AWS serverless starter template using **AWS CDK v2**, **TypeScript**, and **GitHub Actions**.

## What's included

- **Lambda function** with typed API Gateway v2 event handling
- **HTTP API** (API Gateway v2) with custom domain and JWT authorisation
- **Cognito user pool** with hosted UI, JWT authoriser, and SSM-stored config
- **DynamoDB table** with PAY_PER_REQUEST billing and prod/non-prod retention policy
- **S3 bucket** for private object storage
- **CloudFront + S3** frontend distribution with custom domain (prod and dev only)
- **Dead letter queue** for failed Lambda invocations
- **CDK v2 stack** with `NodejsFunction` (esbuild bundling, ARM64, Node 20)
- **GitHub Actions** CI/CD — lint/test on PRs, sequential dev → prod deploy on merge to `main`
- **Ephemeral PR stacks** — isolated AWS environment per PR, torn down on close
- **Jest** unit tests with AWS SDK mocking
- **ESLint + Prettier** with Airbnb TypeScript rules

## Getting started

### 1. Fork / use as template

Click **Use this template** on GitHub, then clone your new repo.

### 2. Rename the stack

Update the `name` field in `package.json` and the values in `infrastructure/lib/config.ts`:

```ts
export const config = {
  stackName: 'your-project-name',
  deploymentRegion: 'us-east-1',

  domain: {
    root: 'your-domain.com',
    api: 'api',
    app: 'app',
    auth: 'your-project-auth',
  },

  ssm: {
    cognitoIssuerUrl: (stage: string) => `/your-project-name/${stage}/cognito/issuer-url`,
    cognitoClientId: (stage: string) => `/your-project-name/${stage}/cognito/client-id`,
  },
};
```

### 3. Install dependencies

```bash
npm install
```

### 4. Run tests

```bash
npm test
```

### 5. Deploy

Ensure your AWS credentials are configured, then:

```bash
npx cdk bootstrap     # first time only
npx cdk deploy        # deploys the prod stack
```

## Project structure

```
├── infrastructure/
│   ├── bin/app.ts                       # CDK entry point — resolves stack type and stage
│   └── lib/
│       ├── config.ts                    # Stack name, region, domain, SSM paths
│       ├── main-stack.ts                # Stack definition
│       └── constructs/
│           ├── api/api-gateway.ts       # HTTP API v2, custom domain, JWT authoriser
│           ├── auth/auth.ts             # Cognito user pool, hosted UI, SSM outputs
│           ├── data/database.ts         # DynamoDB table
│           ├── data/storage.ts          # S3 bucket
│           ├── frontend/frontend.ts     # CloudFront + S3 + custom domain
│           └── lambda/request-handler.ts# NodejsFunction, DLQ, env vars, IAM grants
├── src/
│   ├── functions/
│   │   └── requestHandler/             # Lambda handler, environment, data service + tests
│   ├── models/                         # Shared TypeScript types
│   └── utils/logger.ts                 # Structured JSON logger
├── .github/workflows/                  # GitHub Actions CI/CD
└── cdk.json
```

## CI/CD

### GitHub Actions workflows

| Workflow     | Trigger                            | What happens                                                                                   |
| ------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ci.yml`     | Push to any branch, PR to `main`   | Lint, type-check, unit tests                                                                   |
| `pr.yml`     | PR opened / updated against `main` | Deploy **ephemeral stack** named `serverless-starter-{stage}` and post the URL as a PR comment |
| `pr.yml`     | PR closed (merged or abandoned)    | **Destroy** the ephemeral stack automatically                                                  |
| `deploy.yml` | Push to `main`                     | Deploy **dev** stack, then **production** stack sequentially                                   |

### Ephemeral environments

Every PR against `main` gets its own isolated AWS stack so you can test changes end-to-end before merging. Ephemeral stacks share the **dev** Cognito user pool via SSM parameters rather than creating their own.

**How the stage name is derived from the branch name:**

| Branch                        | Derived stage                             |
| ----------------------------- | ----------------------------------------- |
| `feature/ABC-123-my-feature`  | `abc-123` (ticket ID extracted)           |
| `fix/update-handler`          | `fix-update-handler` (sanitised slug)     |
| `dependabot/npm_and_yarn/...` | `dependabot-npm-and` (slug, max 20 chars) |

The CDK stack is named `<stackName>-<stage>` (e.g. `serverless-starter-abc-123`).

To deploy or destroy an ephemeral stack manually:

```bash
npx cdk deploy serverless-starter-abc-123 --require-approval never -c stackType=ephemeral -c stage=abc-123
npx cdk destroy serverless-starter-abc-123 --force -c stackType=ephemeral -c stage=abc-123
```

### Required GitHub secrets and environments

Workflows use AWS OIDC — no long-lived access keys are stored in GitHub.

Create three **GitHub Environments** (`ephemeral`, `dev`, `production`) and add this secret to each:

| Secret                | Description                                         |
| --------------------- | --------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN` | ARN of the IAM role GitHub Actions assumes via OIDC |

**Settings → Environments → [environment name] → Secrets**

The IAM role trust policy must allow `token.actions.githubusercontent.com` as the OIDC provider. See the [AWS docs](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html) for setup.

## Adding a new Lambda function

1. Create a new folder under `src/functions/`
2. Export a `handler` function
3. Add a `NodejsFunction` construct in `infrastructure/lib/constructs/lambda/`
4. Instantiate it in `infrastructure/lib/main-stack.ts` and wire it to an API route or event source

## Environment variables

The Lambda reads environment variables through `src/functions/requestHandler/environment.ts`. Add new variables there and pass them via the construct's `environment` prop in CDK.
