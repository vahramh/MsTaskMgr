param(
  [string]$StackName = "MsTaskMgr-web-prod",
  [string]$Region = "ap-southeast-2",
  [string]$Profile = "MsTaskMgrDeployer",
  [string]$DomainName = "tm.melsoft.com.au",
  [string]$AcmCertificateArn = "",
  [string]$PriceClass = "PriceClass_100"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AcmCertificateArn)) {
  throw "AcmCertificateArn is required (must be in us-east-1 for CloudFront)."
}

# 1) Deploy/Update the hosting stack (S3 + CloudFront)
sam deploy `
  --template-file infra/web-hosting.yaml `
  --stack-name $StackName `
  --region $Region `
  --capabilities CAPABILITY_IAM `
  --resolve-s3 `
  --profile $Profile `
  --parameter-overrides `
    DomainName="$DomainName" `
    AcmCertificateArn="$AcmCertificateArn" `
    PriceClass="$PriceClass" `
  --no-confirm-changeset

# 2) Read outputs
$stack = aws cloudformation describe-stacks --stack-name $StackName --region $Region --profile $Profile | ConvertFrom-Json
$outputs = @{}
foreach ($o in $stack.Stacks[0].Outputs) { $outputs[$o.OutputKey] = $o.OutputValue }

$bucket = $outputs["BucketName"]
$distId = $outputs["DistributionId"]

Write-Host "Hosting bucket: $bucket"
Write-Host "CloudFront distribution: $distId"

# 3) Build the web app in production mode (uses apps/web/.env.production)
npm run build:web

# 4) Upload build to S3
aws s3 sync .\apps\web\dist\ "s3://$bucket/" --delete --profile $Profile --region $Region

# 5) Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id $distId --paths "/*" --profile $Profile | Out-Null

Write-Host "Done."
