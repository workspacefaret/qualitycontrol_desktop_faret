using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;

namespace QualityControlCenter.Modules.BinsPrint
{
    public class BinsPrintHandler
    {
        private readonly BinsPrintService _service;

        public BinsPrintHandler()
        {
            _service = new BinsPrintService();
        }

        public async Task<string> Handle(string action, Dictionary<string, object>? data)
        {
            switch (action)
            {
                case "binsPrint.imprimir":
                    return await Imprimir(data);

                default:
                    return JsonSerializer.Serialize(new { ok = false, error = "Acción no válida" });
            }
        }

        private Task<string> Imprimir(Dictionary<string, object>? data)
        {
            try
            {
                var bin = data != null && data.ContainsKey("bin") ? data["bin"]?.ToString() : "";

                var result = _service.Imprimir(bin ?? "");

                return Task.FromResult(JsonSerializer.Serialize(new { ok = true, data = result }));
            }
            catch (System.Exception ex)
            {
                return Task.FromResult(
                    JsonSerializer.Serialize(new { ok = false, error = ex.Message })
                );
            }
        }
    }
}
