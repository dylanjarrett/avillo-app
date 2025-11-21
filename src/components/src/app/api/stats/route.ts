// AvilloOS Mock Stats API
export async function GET() {
  return Response.json({
    activeClients: 12,
    pendingDeals: 4,
    aiReports: 26
  });
}
