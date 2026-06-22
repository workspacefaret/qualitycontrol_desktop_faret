using System;
using System.Net.Sockets;
using System.Text;

namespace QualityControlCenter.Modules.BinsPrint
{
    public class BinsPrintService
    {
        private const string ZEBRA_IP = "10.10.50.166";
        private const int ZEBRA_PORT = 9100;

        private const string QR_BASE_URL = "https://consumo_papel.faret.cl/bins/scan.php?bin=";

        public string Imprimir(string bin)
        {
            try
            {
                // =========================
                // VALIDACIÓN
                // =========================
                if (string.IsNullOrWhiteSpace(bin))
                    throw new Exception("BIN vacío");

                if (!int.TryParse(bin, out _))
                    throw new Exception("BIN inválido");

                var binCode = $"BIN-{bin}";
                var qrUrl = QR_BASE_URL + binCode;

                Console.WriteLine($"🧾 BIN: {binCode}");
                Console.WriteLine($"🔗 QR: {qrUrl}");

                // =========================
                // ZPL (IGUAL AL PHP)
                // =========================
                var zpl =
                    "^XA\n"
                    + "^PW1160\n"
                    + "^LL1344\n"
                    + "^LH0,0\n"
                    + "^FO195,120\n"
                    + "^BQN,2,23\n"
                    + $"^FDLA,{qrUrl}^FS\n"
                    + "^FO420,960\n"
                    + "^A0N,120,120\n"
                    + $"^FDBIN {bin}^FS\n"
                    + "^XZ\n";

                // =========================
                // ENVÍO A ZEBRA
                // =========================
                using var client = new TcpClient();
                client.Connect(ZEBRA_IP, ZEBRA_PORT);

                using var stream = client.GetStream();
                var bytes = Encoding.ASCII.GetBytes(zpl);

                stream.Write(bytes, 0, bytes.Length);
                stream.Flush();

                Console.WriteLine("🖨 Impresión enviada");

                return $"Impresión enviada: {binCode}";
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ ERROR ZEBRA: {ex.Message}");
                throw new Exception("Error imprimiendo: " + ex.Message);
            }
        }
    }
}
