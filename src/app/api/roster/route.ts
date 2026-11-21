import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateMonthlyRoster } from '@/lib/scheduler';

// GET: Fetch the roster, employees, pods, brands, processes, and conflicts for a given year & month
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get('year')) || 2026;
  const month = Number(searchParams.get('month')) || 12;

  const [pods, employees, brands, processes, holidays, leaves, roster] =
    await Promise.all([
      prisma.pod.findMany({
        include: { lead: true },
        orderBy: { name: 'asc' },
      }),
      prisma.employee.findMany({
        where: { isActive: true },
        include: {
          pod: true,
          allocations: { include: { brand: true, process: true } },
        },
        orderBy: { employeeCode: 'asc' },
      }),
      prisma.brand.findMany({
        where: { isActive: true },
        include: {
          pod: true,
          brandProcesses: { include: { process: true } },
          allocations: { include: { employee: true, process: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.process.findMany({ orderBy: { code: 'asc' } }),
      prisma.publicHoliday.findMany({ orderBy: { date: 'asc' } }),
      prisma.employeeLeave.findMany({
        include: { employee: true },
        orderBy: { date: 'asc' },
      }),
      prisma.monthlyRoster.findUnique({
        where: { month_year: { month, year } },
        include: {
          entries: {
            include: { brand: true, process: true },
          },
          conflicts: {
            orderBy: [{ severity: 'asc' }, { date: 'asc' }],
          },
        },
      }),
    ]);

  return NextResponse.json({
    pods,
    employees,
    brands,
    processes,
    holidays,
    leaves,
    roster,
  });
}

// POST: Generate (or regenerate) the monthly roster and run conflict detection
export async function POST(request: Request) {
  const body = await request.json();
  const year = Number(body.year) || 2026;
  const month = Number(body.month) || 12;

  const rosterId = await generateMonthlyRoster(year, month);
  return NextResponse.json({ success: true, rosterId });
}