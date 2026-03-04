param(
  [string]$StackName = "MsTaskMgr-prod",
  [string]$Region = "ap-southeast-2",
  [string]$Profile = "MsTaskMgrDeployer",
  [string]$UserPoolId = "ap-southeast-2_2X2XtKkRA",
  [string]$ClientId = "19qj35nqj8r9lf8nfiefbtl01b",
  [string]$AllowedOrigins = "https://tm.melsoft.com.au,http://localhost:5173,http://127.0.0.1:5173"
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
    AllowedOrigins="$AllowedOrigins" `
  --no-confirm-changeset
