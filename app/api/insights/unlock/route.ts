import { insightsHandlers } from '../../../../lib/insights/server';

export const dynamic = 'force-dynamic';
export function POST(request: Request) { return insightsHandlers().unlock(request); }
