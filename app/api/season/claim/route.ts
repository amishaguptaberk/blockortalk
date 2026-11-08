import { seasonHandlers, unavailable } from '../../../../lib/season/server';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return seasonHandlers()?.POST(request) ?? unavailable(); }
