import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Resetting database...');
  await prisma.rosterConflict.deleteMany();
  await prisma.rosterEntry.deleteMany();
  await prisma.monthlyRoster.deleteMany();
  await prisma.employeeLeave.deleteMany();
  await prisma.publicHoliday.deleteMany();
  await prisma.resourceAllocation.deleteMany();
  await prisma.brandProcess.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.process.deleteMany();
  await prisma.pod.updateMany({ data: { leadId: null } });
  await prisma.employee.deleteMany();
  await prisma.pod.deleteMany();

  // 1. Create 4 Processes
  const [cs, acc, ndr, ret] = await Promise.all([
    prisma.process.create({ data: { name: 'Customer Support', code: 'CS' } }),
    prisma.process.create({ data: { name: 'Abandoned Cart Conversions', code: 'ACC' } }),
    prisma.process.create({ data: { name: 'Non-Delivery Report', code: 'NDR' } }),
    prisma.process.create({ data: { name: 'Retention', code: 'RET' } }),
  ]);

  // 2. Create 4 Operational Pods
  const podNames = ['Pod Alpha', 'Pod Bravo', 'Pod Charlie', 'Pod Delta'];
  const pods = await Promise.all(
    podNames.map((name) => prisma.pod.create({ data: { name } }))
  );

  // 3. Create 32 Employees (8 per pod: 1 Pod Lead + 7 Agents)
  const employeeNames = [
    'Aarav Mehta', 'Priya Nair', 'Rohan Sharma', 'Ananya Iyer',
    'Vikram Joshi', 'Sneha Kulkarni', 'Kabir Verma', 'Meera Rao',
    'Siddharth Kapoor', 'Neha Gupta', 'Arjun Reddy', 'Pooja Desai',
    'Karan Malhotra', 'Divya Menon', 'Aditya Bansal', 'Riya Chatterjee',
    'Rahul Sengupta', 'Kavita Krishnan', 'Nikhil Patil', 'Shruti Agarwal',
    'Manish Tiwari', 'Tanvi Saxena', 'Varun Khanna', 'Nandini Pillai',
    'Devansh Choudhury', 'Swati Mishra', 'Harsh Vardhan', 'Isha Bhatia',
    'Pranav Gokhale', 'Ayesha Siddiqui', 'Tarun Nambiar', 'Simran Kaur',
  ];

  const employees = [];
  for (let i = 0; i < employeeNames.length; i++) {
    const podIndex = Math.floor(i / 8);
    const isPodLead = i % 8 === 0;
    const emp = await prisma.employee.create({
      data: {
        employeeCode: `EMP-${String(i + 1).padStart(3, '0')}`,
        name: employeeNames[i],
        email: `${employeeNames[i].toLowerCase().replace(' ', '.')}@datastraw-ops.in`,
        role: isPodLead ? 'POD_LEAD' : 'AGENT',
        podId: pods[podIndex].id,
        preferredWeeklyOff: i % 7,
      },
    });
    employees.push(emp);

    if (isPodLead) {
      await prisma.pod.update({
        where: { id: pods[podIndex].id },
        data: { leadId: emp.id },
      });
    }
  }

  // 4. Create 12 Single-Resource Brands (80% of 15 brands)
  const singleBrands = [
    { name: 'ZestSkin Care', podIdx: 0, empIdx: 1, rule: 'NO_SUNDAYS_NO_HOLIDAYS', procs: [cs, acc] },
    { name: 'UrbanThreads', podIdx: 0, empIdx: 2, rule: 'ALL_DAYS_EXCEPT_HOLIDAYS', procs: [cs, ndr] },
    { name: 'PureBrew Coffee', podIdx: 0, empIdx: 3, rule: 'ALL_365_DAYS', procs: [cs, acc, ndr] },
    { name: 'NutriVibe Labs', podIdx: 1, empIdx: 9, rule: 'NO_SUNDAYS_NO_HOLIDAYS', procs: [cs, ret] },
    { name: 'Lumina Home', podIdx: 1, empIdx: 10, rule: 'ALL_DAYS_EXCEPT_HOLIDAYS', procs: [cs, acc] },
    { name: 'Stride Footwear', podIdx: 1, empIdx: 11, rule: 'NO_SUNDAYS_NO_HOLIDAYS', procs: [cs, ndr] },
    { name: 'GlowCraft Beauty', podIdx: 2, empIdx: 17, rule: 'ALL_365_DAYS', procs: [cs, acc, ret] },
    { name: 'TerraWare Kitchen', podIdx: 2, empIdx: 18, rule: 'NO_SUNDAYS_NO_HOLIDAYS', procs: [cs, ndr] },
    { name: 'PulseFit Nutrition', podIdx: 2, empIdx: 19, rule: 'ALL_DAYS_EXCEPT_HOLIDAYS', procs: [cs, acc] },
    { name: 'EcoNest Kids', podIdx: 3, empIdx: 25, rule: 'NO_SUNDAYS_NO_HOLIDAYS', procs: [cs, ret] },
    { name: 'AuraScents', podIdx: 3, empIdx: 26, rule: 'ALL_DAYS_EXCEPT_HOLIDAYS', procs: [cs, acc, ndr] },
    { name: 'CraftRoast Tea', podIdx: 3, empIdx: 27, rule: 'NO_SUNDAYS_NO_HOLIDAYS', procs: [cs, ndr] },
  ];

  for (const cfg of singleBrands) {
    const brand = await prisma.brand.create({
      data: { name: cfg.name, podId: pods[cfg.podIdx].id },
    });

    for (const proc of cfg.procs) {
      await prisma.brandProcess.create({
        data: { brandId: brand.id, processId: proc.id, operatingRule: cfg.rule, minDailyStaff: 1 },
      });
      await prisma.resourceAllocation.create({
        data: {
          employeeId: employees[cfg.empIdx].id,
          brandId: brand.id,
          processId: proc.id,
          isPrimary: true,
          allocationPct: 100,
        },
      });
    }
  }

  // 5. Create 3 Multi-Resource Brands (20% of 15 brands)
  // Brand A: 3 employees handling SEPARATE processes
  const aurelia = await prisma.brand.create({ data: { name: 'Aurelia Botanics', podId: pods[0].id } });
  await prisma.brandProcess.createMany({
    data: [
      { brandId: aurelia.id, processId: cs.id, operatingRule: 'ALL_365_DAYS', minDailyStaff: 1 },
      { brandId: aurelia.id, processId: acc.id, operatingRule: 'ALL_DAYS_EXCEPT_HOLIDAYS', minDailyStaff: 1 },
      { brandId: aurelia.id, processId: ndr.id, operatingRule: 'NO_SUNDAYS_NO_HOLIDAYS', minDailyStaff: 1 },
    ],
  });
  await prisma.resourceAllocation.createMany({
    data: [
      { employeeId: employees[4].id, brandId: aurelia.id, processId: cs.id, isPrimary: true, allocationPct: 100 },
      { employeeId: employees[5].id, brandId: aurelia.id, processId: acc.id, isPrimary: true, allocationPct: 100 },
      { employeeId: employees[6].id, brandId: aurelia.id, processId: ndr.id, isPrimary: true, allocationPct: 100 },
    ],
  });

  // Brand B: 3 employees with OVERLAPPING CS process (needs 2 staff/day)
  const veloce = await prisma.brand.create({ data: { name: 'Veloce Athletics', podId: pods[1].id } });
  await prisma.brandProcess.createMany({
    data: [
      { brandId: veloce.id, processId: cs.id, operatingRule: 'ALL_365_DAYS', minDailyStaff: 2 },
      { brandId: veloce.id, processId: ndr.id, operatingRule: 'ALL_DAYS_EXCEPT_HOLIDAYS', minDailyStaff: 1 },
    ],
  });
  await prisma.resourceAllocation.createMany({
    data: [
      { employeeId: employees[12].id, brandId: veloce.id, processId: cs.id, isPrimary: true, allocationPct: 100 },
      { employeeId: employees[13].id, brandId: veloce.id, processId: cs.id, isPrimary: true, allocationPct: 100 },
      { employeeId: employees[14].id, brandId: veloce.id, processId: cs.id, isPrimary: false, allocationPct: 50 },
      { employeeId: employees[14].id, brandId: veloce.id, processId: ndr.id, isPrimary: true, allocationPct: 50 },
    ],
  });

  // Brand C: 2 employees sharing CS & Retention
  const kova = await prisma.brand.create({ data: { name: 'Kova Living', podId: pods[2].id } });
  await prisma.brandProcess.createMany({
    data: [
      { brandId: kova.id, processId: cs.id, operatingRule: 'ALL_365_DAYS', minDailyStaff: 1 },
      { brandId: kova.id, processId: ret.id, operatingRule: 'ALL_DAYS_EXCEPT_HOLIDAYS', minDailyStaff: 1 },
    ],
  });
  await prisma.resourceAllocation.createMany({
    data: [
      { employeeId: employees[20].id, brandId: kova.id, processId: cs.id, isPrimary: true, allocationPct: 50 },
      { employeeId: employees[20].id, brandId: kova.id, processId: ret.id, isPrimary: true, allocationPct: 50 },
      { employeeId: employees[21].id, brandId: kova.id, processId: cs.id, isPrimary: true, allocationPct: 50 },
      { employeeId: employees[21].id, brandId: kova.id, processId: ret.id, isPrimary: true, allocationPct: 50 },
    ],
  });

  // 6. Add Public Holiday & Sample Leaves for December 2026
  await prisma.publicHoliday.create({
    data: { date: new Date('2026-12-25T00:00:00.000Z'), name: 'Christmas Day' },
  });

  await prisma.employeeLeave.createMany({
    data: [
      {
        employeeId: employees[1].id, // Priya Nair (Single owner of ZestSkin Care -> creates a real gap!)
        date: new Date('2026-12-10T00:00:00.000Z'),
        type: 'PLANNED_LEAVE',
        status: 'APPROVED',
        reason: 'Family wedding',
      },
      {
        employeeId: employees[12].id, // Karan Malhotra (Veloce Athletics -> 3 staff cover min 2!)
        date: new Date('2026-12-15T00:00:00.000Z'),
        type: 'COMP_OFF',
        status: 'APPROVED',
        reason: 'Festival weekend comp-off',
      },
    ],
  });

  console.log('Success! Seeded 4 Pods, 32 Employees, 15 Brands, Holidays & Leaves.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });