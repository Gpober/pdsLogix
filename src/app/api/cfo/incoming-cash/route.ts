import { NextResponse } from 'next/server';
import { getIncomingCashThisWeek } from '@/server/cash-and-payroll';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const result = await getIncomingCashThisWeek(body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
