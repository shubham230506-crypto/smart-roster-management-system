import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateRoster } from '@/lib/scheduler';

// POST: Add a planned leave or comp-off and immediately update existing roster + re-validate!
export async function POST(request: Request) {
  const body = await request.json();
  const { employeeId, date, type, reason } = body;

  const parsedDate = new Date(`${date}T00:00:00.000Z`);

  const leave = await prisma.employeeLeave.upsert({
    where: {
      employeeId_date: { employeeId, date: parsedDate },
    },
    update: { type, reason, status: 'APPROVED' },
    create: {
      employeeId,
      date: parsedDate,
      type: type || 'PLANNED_LEAVE',
      reason: reason || 'Approved leave',
      status: 'APPROVED',
    },
  });

  // If a roster already exists for this month, update that employee's cell and re-validate!
  const year = parsedDate.getUTCFullYear();
  const month = parsedDate.getUTCMonth() + 1;

  const existingRoster = await prisma.monthlyRoster.findUnique({
    where: { month_year: { month, year } },
  });

  if (existingRoster) {
    await prisma.rosterEntry.updateMany({
      where: {
        rosterId: existingRoster.id,
        employeeId,
        date: parsedDate,
      },
      data: {
        status: type === 'COMP_OFF' ? 'COMP_OFF' : 'PLANNED_LEAVE',
        brandId: null,
        processId: null,
        isManualEdit: true,
      },
    });

    await validateRoster(existingRoster.id);
  }

  return NextResponse.json({ success: true, leave });
}