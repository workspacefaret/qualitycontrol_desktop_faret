using System;
using System.IO;
using System.Reflection;
using System.Text.Json;
using QualityControlCenter.Backend.Models;

namespace QualityControlCenter.Backend.Services
{
    public class UpdateService
    {
        private const string LatestJsonPath = @"\\192.168.1.71\Qcontrol_Updates\latest.json";

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
