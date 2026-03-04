param(
  [Parameter(Mandatory=$true)]
  [string]$ApiBase,                  # e.g. https://egojlqlaej.execute-api.ap-southeast-2.amazonaws.com

  [Parameter(Mandatory=$true)]
  [string]$OwnerIdToken,              # id_token for owner (from sessionStorage mstaskmgr_tokens_v1)

  [Parameter(Mandatory=$false)]
  [string]$GranteeIdToken = "",       # OPTIONAL id_token for grantee user

  [switch]$RunSharedTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function J($obj) { $obj | ConvertTo-Json -Depth 30 }

function New-Headers([string]$token) {
  return @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
  }
}

function CallApi([string]$method, [string]$url, [hashtable]$headers, $bodyObj = $null) {
  try {
    if ($null -eq $bodyObj) {
      return Invoke-RestMethod -Method $method -Uri $url -Headers $headers -ErrorAction Stop
    } else {
      return Invoke-RestMethod -Method $method -Uri $url -Headers $headers -Body (J $bodyObj) -ErrorAction Stop
    }
  } catch {
    $resp = $_.Exception.Response
    if ($resp -and $resp.GetResponseStream()) {
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $text = $reader.ReadToEnd()
      Write-Host ""
      Write-Host "HTTP ERROR $($resp.StatusCode.value__) $method $url" -ForegroundColor Red
      Write-Host $text -ForegroundColor Red
      Write-Host ""
    } else {
      Write-Host ""
      Write-Host "ERROR $method ${url}: $($_.Exception.Message)" -ForegroundColor Red
      Write-Host ""
    }
    throw
  }
}

function Get-TaskObj($resp) {
  if ($null -eq $resp) { return $null }
  if ($resp.PSObject.Properties.Name -contains "task") { return $resp.task }
  if ($resp.PSObject.Properties.Name -contains "subtask") { return $resp.subtask }
  if ($resp.PSObject.Properties.Name -contains "item") { return $resp.item }
  return $resp
}function Get-TaskObj($resp) {
  if ($null -eq $resp) { return $null }
  if ($resp.PSObject.Properties.Name -contains "task") { return $resp.task }
  if ($resp.PSObject.Properties.Name -contains "subtask") { return $resp.subtask }
  if ($resp.PSObject.Properties.Name -contains "item") { return $resp.item }
  return $resp
}
function Expect-Fail([scriptblock]$fn, [string]$label) {
  try {
    & $fn | Out-Null
    throw "Expected failure, but succeeded: $label"
  } catch {
    Write-Host "PASS (expected fail): $label" -ForegroundColor Green
  }
}

function Expect-True([bool]$cond, [string]$label) {
  if (-not $cond) { throw "FAIL: $label" }
  Write-Host "PASS: $label" -ForegroundColor Green
}

function Title([string]$s) {
  Write-Host ""
  Write-Host "=== $s ===" -ForegroundColor Cyan
}

Write-Host "API: $ApiBase" -ForegroundColor Cyan

# Headers
$ownerHeaders = New-Headers $OwnerIdToken

# Health (public)
Title "Health"
$health = CallApi "GET" "$ApiBase/health" @{}
Expect-True ($health.ok -eq $true) "GET /health ok=true"

# /me (auth)
Title "Owner identity"
$meOwner = CallApi "GET" "$ApiBase/me" $ownerHeaders $null
$ownerSub = $meOwner.sub
if ([string]::IsNullOrWhiteSpace($ownerSub)) { throw "/me did not return sub" }
Write-Host "OwnerSub: $ownerSub"

# Create root task
Title "Owner: create root action"
$rootCreate = CallApi "POST" "$ApiBase/tasks" $ownerHeaders @{ title = "Smoke root action" }
$rootId = $rootCreate.task.taskId
Write-Host "RootId: $rootId"
Expect-True ($rootCreate.task.status -eq "OPEN") "Root status OPEN"

# Strict: inbox cannot have dueDate (PATCH dueDate only should fail)
Title "Owner: strict GTD invariants on root"
Expect-Fail {
  CallApi "PATCH" "$ApiBase/tasks/$rootId" $ownerHeaders @{ dueDate = "2026-03-10" }
} "Inbox cannot have dueDate (root PATCH dueDate only)"

# Correct: state=scheduled + dueDate
$rootScheduled = CallApi "PATCH" "$ApiBase/tasks/$rootId" $ownerHeaders @{ state = "scheduled"; dueDate = "2026-03-10" }
Expect-True ($rootScheduled.task.state -eq "scheduled") "Root moved to scheduled"
Expect-True ($rootScheduled.task.dueDate -eq "2026-03-10") "Root dueDate set"

# Waiting requires waitingFor
Expect-Fail {
  CallApi "PATCH" "$ApiBase/tasks/$rootId" $ownerHeaders @{ state = "waiting" }
} "Waiting requires waitingFor (root)"

$rootWaiting = CallApi "PATCH" "$ApiBase/tasks/$rootId" $ownerHeaders @{ state = "waiting"; waitingFor = "Reply from Alice" }
Expect-True ($rootWaiting.task.state -eq "waiting") "Root moved to waiting with waitingFor"

# Complete then reopen
Title "Owner: complete + reopen root"
$rootCompleted = CallApi "POST" "$ApiBase/tasks/$rootId/complete" $ownerHeaders @{}
Expect-True ($rootCompleted.task.status -eq "COMPLETED") "Root completed status COMPLETED"
Expect-True ($rootCompleted.task.state -eq "completed") "Root completed state=completed"

$rootReopen = CallApi "POST" "$ApiBase/tasks/$rootId/reopen" $ownerHeaders @{}
$rootReopen | ConvertTo-Json -Depth 20 | Write-Host
Expect-True ($rootReopen.task.status -eq "OPEN") "Root reopened status OPEN"
# dueDate exists => scheduled
Expect-True ($rootReopen.task.state -eq "scheduled") "Root reopened -> scheduled (dueDate present)"

# Subtasks: create + strict + complete + reopen
Title "Owner: subtasks create + strict + complete + reopen"
$subCreate = CallApi "POST" "$ApiBase/tasks/$rootId/subtasks" $ownerHeaders @{ title = "Smoke subtask action" }
$subId = $subCreate.task.taskId
Write-Host "SubId: $subId"
Expect-True ($subCreate.task.status -eq "OPEN") "Subtask status OPEN"

# Subtask inbox cannot have dueDate
Expect-Fail {
  CallApi "PATCH" "$ApiBase/tasks/$rootId/subtasks/$subId" $ownerHeaders @{ dueDate = "2026-03-11" }
} "Inbox cannot have dueDate (subtask PATCH dueDate only)"

# Correct: schedule subtask + dueDate
$subScheduled = CallApi "PATCH" "$ApiBase/tasks/$rootId/subtasks/$subId" $ownerHeaders @{ state = "scheduled"; dueDate = "2026-03-11" }
$st = Get-TaskObj $subScheduled
$st | ConvertTo-Json -Depth 10 | Write-Host
Expect-True ($st.state -eq "scheduled") "Subtask moved to scheduled"

# Complete subtask
$subCompleted = CallApi "PATCH" "$ApiBase/tasks/$rootId/subtasks/$subId" $ownerHeaders @{ state = "completed" }
Expect-True ($(Get-TaskObj $subCompleted).status -eq "COMPLETED") "Subtask completed status COMPLETED"

# Reopen subtask
$subReopen = CallApi "POST" "$ApiBase/tasks/$rootId/subtasks/$subId/reopen" $ownerHeaders @{}
Expect-True ($(Get-TaskObj $subReopen).status -eq "OPEN") "Subtask reopened status OPEN"
Expect-True ($(Get-TaskObj $subReopen).state -eq "scheduled") "Subtask reopened -> scheduled (dueDate present)"

# List subtasks (owner)
Title "Owner: list subtasks"
$subList = CallApi "GET" "$ApiBase/tasks/$rootId/subtasks" $ownerHeaders $null
Expect-True ($subList.items.Count -ge 1) "GET /tasks/{taskId}/subtasks returned at least 1 item"

Write-Host ""
Write-Host "=== OWNER-ONLY SMOKE TESTS PASSED ===" -ForegroundColor Cyan

# -----------------------------
# Shared tests (optional)
# -----------------------------
if ($RunSharedTests) {
  if ([string]::IsNullOrWhiteSpace($GranteeIdToken)) {
    throw "RunSharedTests set but GranteeIdToken missing."
  }

  $granteeHeaders = New-Headers $GranteeIdToken

  Title "Grantee identity"
  $meGrantee = CallApi "GET" "$ApiBase/me" $granteeHeaders $null
  $granteeSub = $meGrantee.sub
  if ([string]::IsNullOrWhiteSpace($granteeSub)) { throw "/me did not return sub for grantee" }
  Write-Host "GranteeSub: $granteeSub"

  Title "Owner: share root to grantee (EDIT)"
  # Your share create route: POST /tasks/{taskId}/shares
  # Assumed body: { granteeSub: "...", mode: "EDIT" } (adjust if your handler expects different keys)
  $shareResp = CallApi "POST" "$ApiBase/tasks/$rootId/shares" $ownerHeaders @{ granteeSub = $granteeSub; mode = "EDIT" }
  Write-Host "Shared root to grantee."

  Title "Grantee: list shared with me"
  $sharedList = CallApi "GET" "$ApiBase/shared" $granteeHeaders $null
  Expect-True ($sharedList.items.Count -ge 1) "GET /shared returned at least 1 shared root"

  Title "Grantee: shared root GET"
  $sharedRoot = CallApi "GET" "$ApiBase/shared/$ownerSub/tasks/$rootId" $granteeHeaders $null
  Expect-True ($sharedRoot.task.taskId -eq $rootId) "GET shared root returns correct task"

  Title "Grantee: shared subtasks list (YAML route)"
  # YAML: GET /shared/{ownerSub}/tasks/{rootTaskId}/subtasks/{parentTaskId}
  $sharedSubList = CallApi "GET" "$ApiBase/shared/$ownerSub/tasks/$rootId/subtasks/$rootId" $granteeHeaders $null
  Expect-True ($sharedSubList.items.Count -ge 1) "Shared subtasks list returned at least 1 item"

  Title "Grantee: shared edit strict rules (waiting requires waitingFor)"
  # Pick first subtask from shared list
  $targetSubId = $sharedSubList.items[0].taskId

  Expect-Fail {
    CallApi "PATCH" "$ApiBase/shared/$ownerSub/tasks/$rootId/subtasks/$rootId/$targetSubId" $granteeHeaders @{ state = "waiting" }
  } "Shared EDIT cannot set waiting without waitingFor"

  $sharedUpdateOk = CallApi "PATCH" "$ApiBase/shared/$ownerSub/tasks/$rootId/subtasks/$rootId/$targetSubId" $granteeHeaders @{ state = "waiting"; waitingFor = "Shared test OK" }
  Expect-True ($sharedUpdateOk.task.state -eq "waiting") "Shared subtask updated to waiting with waitingFor"

  Title "Grantee: shared reopen"
  # Complete then reopen through shared routes:
  $sharedComplete = CallApi "PATCH" "$ApiBase/shared/$ownerSub/tasks/$rootId/subtasks/$rootId/$targetSubId" $granteeHeaders @{ state = "completed" }
  Expect-True ($sharedComplete.task.status -eq "COMPLETED") "Shared subtask completed"

  $sharedReopen = CallApi "POST" "$ApiBase/shared/$ownerSub/tasks/$rootId/subtasks/$rootId/$targetSubId/reopen" $granteeHeaders @{}
  Expect-True ($sharedReopen.task.status -eq "OPEN") "Shared subtask reopened"

  Write-Host ""
  Write-Host "=== SHARED SMOKE TESTS PASSED ===" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "ALL DONE." -ForegroundColor Cyan