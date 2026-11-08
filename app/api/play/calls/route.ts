import { createProductionCallHandlers } from '../../../../lib/season/calls/server';
export const dynamic = 'force-dynamic';
export const POST = (request: Request) => createProductionCallHandlers().POST(request);
