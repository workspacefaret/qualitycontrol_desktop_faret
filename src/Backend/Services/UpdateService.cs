using System;
using System.IO;
using System.Reflection;
using System.Text.Json;
using QualityControlCenter.Backend.Models;

namespace QualityControlCenter.Backend.Services
{
    public class UpdateService
    {
        private const string LatestJsonPath =
            @"\\192.168.1.71\Programas TI\Programas\Quality Control Center\Qcontrol_Updates\latest.json";

        private const string LocalStagingFolder = @"C:\ProgramData\QualityControlCenter";
        private const string LocalInstallerName = "setup.exe";

        public string GetCurrentVersion()
        {
            var version = Assembly.GetExecutingAssembly().GetName().Version;

            if (version == null)
                return "0.0.0";

            return $"{version.Major}.{version.Minor}.{version.Build}";
        }

        public UpdateInfo? GetLatestUpdateInfo()
        {
            try
            {
                if (!File.Exists(LatestJsonPath))
                    return null;

                string json = File.ReadAllText(LatestJsonPath);

                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

                return JsonSerializer.Deserialize<UpdateInfo>(json, options);
            }
            catch
            {
                return null;
            }
        }

        public string PrepareLocalInstaller(string networkInstallerPath)
        {
            Directory.CreateDirectory(LocalStagingFolder);

            var localPath = Path.Combine(LocalStagingFolder, LocalInstallerName);
            File.Copy(networkInstallerPath, localPath, overwrite: true);

            return localPath;
        }

        public bool IsUpdateAvailable(out UpdateInfo? updateInfo)
        {
            updateInfo = GetLatestUpdateInfo();

            if (updateInfo == null || string.IsNullOrWhiteSpace(updateInfo.Version))
                return false;

            try
            {
                var currentVersion = new Version(GetCurrentVersion());
                var latestVersion = new Version(updateInfo.Version);

                return latestVersion > currentVersion;
            }
            catch
            {
                return false;
            }
        }
    }
}
