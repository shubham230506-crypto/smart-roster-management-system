import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST: Add a new Brand + Process Rules + Employee Allocation dynamically via UI
export async function POST(request: Request) {
  const body = await request.json();
  const { action } = body;

  if (action === 'ADD_BRAND') {
    const { name, podId, processIds, operatingRule, minDailyStaff, employeeId } = body;

    const brand = await prisma.brand.create({
      data: { name, podId },
    });

    for (const processId of processIds as string[]) {
      await prisma.brandProcess.create({
        data: {
          brandId: brand.id,
          processId,
          operatingRule: operatingRule || 'ALL_DAYS_EXCEPT_HOLIDAYS',
          minDailyStaff: Number(minDailyStaff) || 1,
        },
      });

      if (employeeId) {
        await prisma.resourceAllocation.create({
          data: {
            employeeId,
            brandId: brand.id,
            processId,
            isPrimary: true,
            allocationPct: 100,
          },
        });
      }
    }

    return NextResponse.json({ success: true, brand });
  }

  if (action === 'ADD_ALLOCATION') {
    const { employeeId, brandId, processId, isPrimary } = body;

    const alloc = await prisma.resourceAllocation.upsert({
      where: {
        employeeId_brandId_processId: { employeeId, brandId, processId },
      },
      update: { isPrimary: Boolean(isPrimary) },
      create: {
        employeeId,
        brandId,
        processId,
        isPrimary: Boolean(isPrimary),
        allocationPct: 50,
      },
    });

    return NextResponse.json({ success: true, allocation: alloc });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}