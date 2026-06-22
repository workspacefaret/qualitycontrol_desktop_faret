namespace QualityControlCenter.Config
{
    public class AppSettings
    {
        public string MySqlHost { get; set; } = "";

        public int MySqlPort { get; set; } = 3306;

        public string MySqlUser { get; set; } = "";

        public string MySqlPassword { get; set; } = "";

        public string QualityDbName { get; set; } = "";
    }
}
