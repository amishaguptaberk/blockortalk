import { createProductionCallHandlers } from '../../../../../lib/season/calls/server';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return createProductionCallHandlers().GET(request, (await context.params).id);
}
export async function POST(request: Request, context: Context) {
  return createProductionCallHandlers().POST(request, (await context.params).id);
}
