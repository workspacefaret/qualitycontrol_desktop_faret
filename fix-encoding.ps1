try {
    [System.Text.Encoding]::RegisterProvider([System.Text.CodePagesEncodingProvider]::Instance)
} catch {}

$latin1 = [System.Text.Encoding]::GetEncoding(1252)
$utf8 = [System.Text.UTF8Encoding]::new($false)

$files = Get-ChildItem ".\src\UI\www" -Recurse -Include *.html,*.js,*.css

foreach ($file in $files) {
    $txt = [System.IO.File]::ReadAllText($file.FullName)

    if ($txt.Contains([char]0x00C3) -or $txt.Contains([char]0x00E2)) {
        $bytes = $latin1.GetBytes($txt)
        $fixed = $utf8.GetString($bytes)
        [System.IO.File]::WriteAllText($file.FullName, $fixed, $utf8)
        Write-Host "FIXED $($file.FullName)"
    }
}
