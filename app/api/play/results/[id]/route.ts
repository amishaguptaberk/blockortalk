import { resultsHandlers } from '../../../../../lib/season/resultsServer';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return resultsHandlers().GET(request, (await context.params).id);
}
