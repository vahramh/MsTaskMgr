param(
  [string]$StackName = "MsTaskMgr-dev",
  [string]$Region = "ap-southeast-2",
  [string]$Profile = "MsTaskMgrDeployer",
  [string]$UserPoolId = "ap-southeast-2_2X2XtKkRA",
  [string]$ClientId = "19qj35nqj8r9lf8nfiefbtl01b"
)

$ErrorActionPreference = "Stop"

Remove-Item -Recurse -Force .aws-sam -ErrorAction SilentlyContinue

sam build --template-file infra/template.yaml

sam deploy `
  --template-file .\.aws-sam\build\template.yaml `
  --stack-name $StackName `
  --region $Region `
  --capabilities CAPABILITY_IAM `
  --resolve-s3 `
  --profile $Profile `
  --parameter-overrides `
    CognitoUserPoolId="$UserPoolId" `
    CognitoUserPoolClientId="$ClientId" `
    CognitoRegion="$Region" `
  --no-confirm-changeset