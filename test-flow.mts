// 验证预约流转业务规则：确认/完成/爽约/取消/作废/幂等/会员累计/流转日志
const lsStore: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => lsStore[k] ?? null,
  setItem: (k: string, v: string) => { lsStore[k] = v; },
  removeItem: (k: string) => { delete lsStore[k]; },
  clear: () => { Object.keys(lsStore).forEach((k) => delete lsStore[k]); },
  key: () => null,
  get length() { return Object.keys(lsStore).length; }
};

const {
  store,
  addAppointment,
  changeAppointmentStatus,
  completeAppointment,
  voidServiceRecord
} = await import('./src/store/index.ts');
const { generateId } = await import('./src/utils/format.ts');

let passed = 0;
let failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`); }
};

const state = () => store.getState().app;
const customer = state().customers[0];
const service = state().services[0];
const employee = state().employees[0];
const membership = () => state().memberships.find((m: any) => m.customerId === customer.id)!;

const makeAppt = () => ({
  id: generateId(),
  customerId: customer.id,
  serviceId: service.id,
  employeeId: employee.id,
  startTime: new Date().toISOString(),
  endTime: new Date(Date.now() + 3600e3).toISOString(),
  duration: 60,
  status: 'pending' as const,
  source: 'wechat' as const,
  notes: '',
  reminderSent: false
});

console.log('1. 新建预约（待确认）');
const a1 = makeAppt();
store.dispatch(addAppointment(a1));
check('创建后状态为 pending', state().appointments.find((a: any) => a.id === a1.id).status === 'pending');
check('创建留了一条流转日志', state().appointmentLogs.filter((l: any) => l.appointmentId === a1.id).length === 1);

console.log('2. 待确认不能直接完成（状态机拦截）');
store.dispatch(completeAppointment(a1.id));
check('状态仍是 pending', state().appointments.find((a: any) => a.id === a1.id).status === 'pending');
check('未生成消费记录', state().serviceRecords.filter((r: any) => r.appointmentId === a1.id).length === 0);

console.log('3. 待确认 -> 确认 -> 完成，生成消费记录并累计会员消费');
const spentBefore = membership().totalSpent;
const pointsBefore = membership().points;
store.dispatch(changeAppointmentStatus({ id: a1.id, toStatus: 'confirmed' }));
check('已确认', state().appointments.find((a: any) => a.id === a1.id).status === 'confirmed');
store.dispatch(completeAppointment(a1.id));
const appt1 = state().appointments.find((a: any) => a.id === a1.id);
const rec1 = state().serviceRecords.find((r: any) => r.appointmentId === a1.id);
check('已完成', appt1.status === 'completed');
check('生成了一条消费记录', !!rec1);
check('消费记录按项目价格入账', rec1?.price === service.price);
check('消费记录落在对应美容师名下', rec1?.employeeId === employee.id);
check('会员累计消费增加', membership().totalSpent === spentBefore + service.price);
check('会员积分增加', membership().points === pointsBefore + Math.floor(service.price / 10));

console.log('4. 同一单重复完成不重复生成');
store.dispatch(completeAppointment(a1.id));
check('仍只有一条有效消费记录', state().serviceRecords.filter((r: any) => r.appointmentId === a1.id && r.status !== 'voided').length === 1);
check('会员累计消费未重复增加', membership().totalSpent === spentBefore + service.price);

console.log('5. 作废消费记录，预约连带退回');
store.dispatch(voidServiceRecord(rec1.id));
check('记录已作废', state().serviceRecords.find((r: any) => r.id === rec1.id).status === 'voided');
check('会员累计消费扣回', membership().totalSpent === spentBefore);
check('会员积分扣回', membership().points === pointsBefore);
check('预约退回已确认', state().appointments.find((a: any) => a.id === a1.id).status === 'confirmed');
check('重复作废无副作用', (() => { store.dispatch(voidServiceRecord(rec1.id)); return membership().totalSpent === spentBefore; })());

console.log('6. 作废后可重新完成并生成新记录');
store.dispatch(completeAppointment(a1.id));
check('重新完成', state().appointments.find((a: any) => a.id === a1.id).status === 'completed');
check('有效记录重新只有一条', state().serviceRecords.filter((r: any) => r.appointmentId === a1.id && r.status !== 'voided').length === 1);
check('累计消费重新入账', membership().totalSpent === spentBefore + service.price);

console.log('7. 爽约与取消流转');
const a2 = makeAppt();
store.dispatch(addAppointment(a2));
store.dispatch(changeAppointmentStatus({ id: a2.id, toStatus: 'no_show' }));
check('待确认可标爽约', state().appointments.find((a: any) => a.id === a2.id).status === 'no_show');
store.dispatch(changeAppointmentStatus({ id: a2.id, toStatus: 'confirmed' }));
check('爽约为终态不可再流转', state().appointments.find((a: any) => a.id === a2.id).status === 'no_show');

const a3 = makeAppt();
store.dispatch(addAppointment(a3));
store.dispatch(changeAppointmentStatus({ id: a3.id, toStatus: 'cancelled' }));
check('待确认可取消', state().appointments.find((a: any) => a.id === a3.id).status === 'cancelled');
store.dispatch(changeAppointmentStatus({ id: a3.id, toStatus: 'confirmed' }));
check('取消为终态不可再流转', state().appointments.find((a: any) => a.id === a3.id).status === 'cancelled');

console.log('8. 已完成不能绕过作废直接回退');
store.dispatch(changeAppointmentStatus({ id: a1.id, toStatus: 'confirmed' }));
check('completed 直接流转被拒绝', state().appointments.find((a: any) => a.id === a1.id).status === 'completed');

console.log('9. 每次状态变更都留痕');
const logs1 = state().appointmentLogs.filter((l: any) => l.appointmentId === a1.id);
check('a1 共 5 条日志（创建/确认/完成/作废退回/再完成）', logs1.length === 5);
check('日志含作废退回说明', logs1.some((l: any) => l.note.includes('作废')));
check('日志含 from/to 状态', logs1.every((l: any) => l.toStatus));

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
