import { seasonHandlers, unavailable } from '../../../lib/season/server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return seasonHandlers()?.GET(request) ?? unavailable(); }
