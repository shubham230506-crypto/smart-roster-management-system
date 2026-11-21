import { prisma } from './prisma';

// Helper 1: Get all dates in a given month (in UTC so dates never shift due to timezone)
export function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= totalDays; d++) {
    days.push(new Date(Date.UTC(year, month - 1, d)));
  }
  return days;
}

// Helper 2: Check if a Brand+Process requires coverage on a specific date
export function isDateRequired(
  operatingRule: string,
  date: Date,
  holidaySet: Set<string>
): boolean {
  const iso = date.toISOString().split('T')[0];
  const isSunday = date.getUTCDay() === 0;
  const isHoliday = holidaySet.has(iso);

  if (operatingRule === 'ALL_365_DAYS') return true;
  if (operatingRule === 'ALL_DAYS_EXCEPT_HOLIDAYS') return !isHoliday;
  return !isSunday && !isHoliday; // NO_SUNDAYS_NO_HOLIDAYS
}

// Main Function 1: Generate a Monthly Roster
export async function generateMonthlyRoster(year: number, month: number) {
  const days = getDaysInMonth(year, month);
  const startDate = days[0];
  const endDate = days[days.length - 1];

  const [employees, brands, holidays, leaves] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      include: {
        allocations: { include: { brand: true, process: true } },
      },
    }),
    prisma.brand.findMany({
      where: { isActive: true },
      include: {
        brandProcesses: { include: { process: true } },
        allocations: { include: { employee: true } },
      },
    }),
    prisma.publicHoliday.findMany({
      where: { date: { gte: startDate, lte: endDate } },
    }),
    prisma.employeeLeave.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        status: 'APPROVED',
      },
    }),
  ]);

  const holidaySet = new Set(
    holidays.map((h) => h.date.toISOString().split('T')[0])
  );
  const leaveMap = new Map<string, (typeof leaves)[0]>();
  for (const l of leaves) {
    leaveMap.set(`${l.employeeId}_${l.date.toISOString().split('T')[0]}`, l);
  }

  // Create or update the MonthlyRoster header
  const roster = await prisma.monthlyRoster.upsert({
    where: { month_year: { month, year } },
    update: { updatedAt: new Date() },
    create: { month, year },
  });

  // Wipe old entries & conflicts before fresh generation
  await prisma.rosterEntry.deleteMany({ where: { rosterId: roster.id } });
  await prisma.rosterConflict.deleteMany({ where: { rosterId: roster.id } });

  const entriesToCreate: {
    rosterId: string;
    date: Date;
    employeeId: string;
    status: string;
    brandId: string | null;
    processId: string | null;
  }[] = [];

  for (const emp of employees) {
    // Find all BrandProcesses this employee handles
    const empBrandProcesses = brands.flatMap((b) =>
      b.brandProcesses.filter((bp) =>
        emp.allocations.some(
          (a) => a.brandId === b.id && a.processId === bp.processId
        )
      )
    );

    const worksOnHolidays = empBrandProcesses.some(
      (bp) => bp.operatingRule === 'ALL_365_DAYS'
    );
    const allBrandsClosedSunday =
      empBrandProcesses.length > 0 &&
      empBrandProcesses.every(
        (bp) => bp.operatingRule === 'NO_SUNDAYS_NO_HOLIDAYS'
      );

    // Align weekly off to Sunday if all their brands are closed on Sunday
    const effectiveWeeklyOff = allBrandsClosedSunday
      ? 0
      : emp.preferredWeeklyOff;
    const primaryAlloc =
      emp.allocations.find((a) => a.isPrimary) || emp.allocations[0];

    for (const date of days) {
      const iso = date.toISOString().split('T')[0];
      const dayOfWeek = date.getUTCDay();
      const leave = leaveMap.get(`${emp.id}_${iso}`);

      let status = 'WORKING';
      let brandId: string | null = primaryAlloc?.brandId ?? null;
      let processId: string | null = primaryAlloc?.processId ?? null;

      if (leave) {
        status = leave.type === 'COMP_OFF' ? 'COMP_OFF' : 'PLANNED_LEAVE';
        brandId = null;
        processId = null;
      } else if (holidaySet.has(iso) && !worksOnHolidays) {
        status = 'PUBLIC_HOLIDAY';
        brandId = null;
        processId = null;
      } else if (dayOfWeek === effectiveWeeklyOff) {
        // Hard vs Soft Constraint Check:
        // If employee is the SOLE owner of a brand that requires coverage today,
        // override their soft preferred weekly off so the brand isn't left unstaffed.
        const soleOwnerRequiredToday = emp.allocations.some((alloc) => {
          const brand = brands.find((b) => b.id === alloc.brandId);
          const bp = brand?.brandProcesses.find(
            (p) => p.processId === alloc.processId
          );
          const uniqueStaff = new Set(
            brand?.allocations.map((a) => a.employeeId)
          ).size;
          return (
            uniqueStaff === 1 &&
            bp &&
            isDateRequired(bp.operatingRule, date, holidaySet)
          );
        });

        if (soleOwnerRequiredToday) {
          status = 'WORKING';
        } else {
          status = 'WEEKLY_OFF';
          brandId = null;
          processId = null;
        }
      }

      entriesToCreate.push({
        rosterId: roster.id,
        date,
        employeeId: emp.id,
        status,
        brandId,
        processId,
      });
    }
  }

  await prisma.rosterEntry.createMany({ data: entriesToCreate });

  // Immediately run conflict validation
  await validateRoster(roster.id);
  return roster.id;
}

// Main Function 2: Validate Every Day & Detect Conflicts / Suggest Backups
export async function validateRoster(rosterId: string) {
  const roster = await prisma.monthlyRoster.findUnique({
    where: { id: rosterId },
    include: {
      entries: { include: { employee: true } },
    },
  });
  if (!roster) return;

  await prisma.rosterConflict.deleteMany({ where: { rosterId } });

  const days = getDaysInMonth(roster.year, roster.month);
  const holidays = await prisma.publicHoliday.findMany({
    where: { date: { gte: days[0], lte: days[days.length - 1] } },
  });
  const holidaySet = new Set(
    holidays.map((h) => h.date.toISOString().split('T')[0])
  );

  const brands = await prisma.brand.findMany({
    where: { isActive: true },
    include: {
      brandProcesses: { include: { process: true } },
      allocations: { include: { employee: true } },
    },
  });

  const allEmployees = await prisma.employee.findMany({
    where: { isActive: true },
    include: { allocations: { include: { process: true } } },
  });

  const conflicts: {
    rosterId: string;
    date: Date;
    severity: string;
    type: string;
    brandId: string | null;
    processId: string | null;
    employeeId: string | null;
    message: string;
    suggestion: string | null;
  }[] = [];

  for (const date of days) {
    const iso = date.toISOString().split('T')[0];
    const dayEntries = roster.entries.filter(
      (e) => e.date.toISOString().split('T')[0] === iso
    );
    const workingEmployeeIds = new Set(
      dayEntries.filter((e) => e.status === 'WORKING').map((e) => e.employeeId)
    );

    // 1. Check Soft Preference Overrides
    for (const entry of dayEntries) {
      if (
        entry.status === 'WORKING' &&
        date.getUTCDay() === entry.employee.preferredWeeklyOff
      ) {
        conflicts.push({
          rosterId,
          date,
          severity: 'WARNING',
          type: 'PREFERENCE_OVERRIDDEN',
          brandId: entry.brandId,
          processId: entry.processId,
          employeeId: entry.employeeId,
          message: `${entry.employee.name} worked on preferred weekly off (${iso}) to satisfy mandatory brand coverage.`,
          suggestion: `Grant a comp-off on a low-demand weekday or assign a pod floater.`,
        });
      }
    }

    // 2. Check Brand & Process Daily Coverage
    for (const brand of brands) {
      const uniqueAssignedEmps = new Set(
        brand.allocations.map((a) => a.employeeId)
      );
      const isSingleResource = uniqueAssignedEmps.size === 1;

      for (const bp of brand.brandProcesses) {
        if (!isDateRequired(bp.operatingRule, date, holidaySet)) continue;

        const assignedForProc = brand.allocations.filter(
          (a) => a.processId === bp.processId
        );
        const activeCount = assignedForProc.filter((a) =>
          workingEmployeeIds.has(a.employeeId)
        ).length;

        if (activeCount < bp.minDailyStaff) {
          // Search for a backup employee in the SAME POD who knows this process
          const backup = allEmployees.find(
            (cand) =>
              cand.podId === brand.podId &&
              !assignedForProc.some((a) => a.employeeId === cand.id) &&
              cand.allocations.some((a) => a.processId === bp.processId) &&
              dayEntries.some(
                (e) =>
                  e.employeeId === cand.id &&
                  (e.status === 'WEEKLY_OFF' || e.status === 'WORKING')
              )
          );

          const suggestion = backup
            ? `Suggested Backup: Reassign ${backup.name} (${backup.employeeCode}, same pod, ${bp.process.code}-trained).`
            : `No idle ${bp.process.code}-trained backup in this pod. Assign Pod Lead or cross-pod cover.`;

          conflicts.push({
            rosterId,
            date,
            severity: 'CRITICAL',
            type:
              activeCount === 0
                ? 'ZERO_BRAND_COVERAGE'
                : 'UNDERSTAFFED_PROCESS',
            brandId: brand.id,
            processId: bp.processId,
            employeeId: assignedForProc[0]?.employeeId ?? null,
            message:
              activeCount === 0
                ? `[${brand.name} • ${bp.process.code}] ZERO COVERAGE on ${iso}${
                    isSingleResource ? ' (Single-resource owner unavailable)' : ''
                  }`
                : `[${brand.name} • ${bp.process.code}] Understaffed on ${iso}: ${activeCount}/${bp.minDailyStaff} active`,
            suggestion,
          });
        }
      }
    }
  }

  if (conflicts.length > 0) {
    await prisma.rosterConflict.createMany({ data: conflicts });
  }
}