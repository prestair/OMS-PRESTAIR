# Usage: .\push.ps1 "your commit message"
# Example: .\push.ps1 "fix: reminder popup flash"
param([string]$msg = "update")

$git = "C:\Program Files\Git\cmd\git.exe"
$repo = "d:\OMS-PRESTAIR-main"

& $git -C $repo config user.email "facility.prestair@gmail.com"
& $git -C $repo config user.name "prestair"
& $git -C $repo add -A
& $git -C $repo commit -m $msg
& $git -C $repo push origin main
