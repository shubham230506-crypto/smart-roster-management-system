import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateRoster } from '@/lib/scheduler';

// PATCH: Update a single schedule cell manually and re-validate conflicts immediately
export async function PATCH(request: Request) {
  const body = await request.json();
  const { entryId, status, brandId, processId } = body;

  const updated = await prisma.rosterEntry.update({
    where: { id: entryId },
    data: {
      status,
      brandId: status === 'WORKING' ? brandId || null : null,
      processId: status === 'WORKING' ? processId || null : null,
      isManualEdit: true,
    },
  });

  // Re-validate the whole roster so gaps/warnings update live
  await validateRoster(updated.rosterId);

  return NextResponse.json({ success: true, entry: updated });
}