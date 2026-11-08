import { meHandlers } from '../../../lib/season/meServer';

export const dynamic = 'force-dynamic';
export function GET(request: Request) { return meHandlers().GET(request); }
