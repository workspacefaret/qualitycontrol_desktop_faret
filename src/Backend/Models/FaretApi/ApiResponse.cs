namespace QualityControlCenter.Backend.Models.FaretApi
{
    public class ApiResponse<T>
    {
        public bool Ok { get; set; }
        public T? Data { get; set; }
        public string? Error { get; set; }
    }
}
