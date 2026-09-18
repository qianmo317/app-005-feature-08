/* eslint-disable */
// 冒烟测试：验证预约状态机、消费记录生成幂等、作废回退
// 运行: npx tsx scripts/smoke-appointment-flow.ts
import { store, addAppointment, changeAppointmentStatus, voidServiceRecord } from '../src/store';
import type { Appointment } from '../src/types';

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
};

const state0 = store.getState().app;
const customer = state0.customers[0];
const service = state0.services[0];
const employee = state0.employees.find(e => e.role === 'beautician')!;
const membership = () => store.getState().app.memberships.find(m => m.customerId === customer.id)!;

const appt: Appointment = {
  id: 'TEST-APPT-1',
  customerId: customer.id,
  serviceId: service.id,
  employeeId: employee.id,
  startTime: new Date().toISOString(),
  endTime: new Date(Date.now() + 60 * 60000).toISOString(),
  duration: 60,
  status: 'pending',
  source: 'wechat',
  notes: '测试预约',
  reminderSent: false,
};
store.dispatch(addAppointment(appt));

console.log('1. 待确认 → 已确认');
store.dispatch(changeAppointmentStatus({ id: appt.id, status: 'confirmed' }));
let a = store.getState().app.appointments.find(x => x.id === appt.id)!;
assert(a.status === 'confirmed', '状态变为已确认');
assert(a.statusHistory?.length === 1 && a.statusHistory[0].from === 'pending' && a.statusHistory[0].to === 'confirmed', '留一条流转记录');

console.log('2. 非法流转被拒绝（已确认 → 待确认）');
store.dispatch(changeAppointmentStatus({ id: appt.id, status: 'pending' }));
a = store.getState().app.appointments.find(x => x.id === appt.id)!;
assert(a.status === 'confirmed', '状态保持已确认');
assert(a.statusHistory?.length === 1, '不新增流转记录');

console.log('3. 已确认 → 已完成，生成消费记录');
const spentBefore = membership().totalSpent;
const pointsBefore = membership().points;
store.dispatch(changeAppointmentStatus({ id: appt.id, status: 'completed' }));
a = store.getState().app.appointments.find(x => x.id === appt.id)!;
const records = () => store.getState().app.serviceRecords.filter(r => r.appointmentId === appt.id && !r.voided);
assert(a.status === 'completed', '状态变为已完成');
assert(records().length === 1, '生成一条消费记录');
const rec = records()[0];
assert(rec.price === service.price, `按项目价格生成（${rec.price} === ${service.price}）`);
assert(rec.employeeId === employee.id, '落到对应美容师名下');
assert(membership().totalSpent === spentBefore + service.price, '会员累计消费增加');
assert(membership().points === pointsBefore + Math.floor(service.price / 10), '会员积分增加');

console.log('4. 同一单不重复生成');
store.dispatch(changeAppointmentStatus({ id: appt.id, status: 'completed' }));
assert(records().length === 1, '重复派发完成动作不产生新记录');

console.log('5. 作废消费记录，预约退回');
store.dispatch(voidServiceRecord(rec.id));
a = store.getState().app.appointments.find(x => x.id === appt.id)!;
const voidedRec = store.getState().app.serviceRecords.find(r => r.id === rec.id)!;
assert(voidedRec.voided === true && !!voidedRec.voidedAt, '记录标记已作废');
assert(a.status === 'confirmed', '预约退回已确认');
assert(a.statusHistory?.length === 3, '流转记录共 3 条');
assert(a.statusHistory![2].note?.includes('作废') ?? false, '退回记录带作废备注');
assert(membership().totalSpent === spentBefore, '会员累计消费回退');
assert(membership().points === pointsBefore, '会员积分回退');
assert(records().length === 0, '无有效消费记录');

console.log('6. 作废后再次完成，生成新记录（旧记录保持作废）');
store.dispatch(changeAppointmentStatus({ id: appt.id, status: 'completed' }));
const all = store.getState().app.serviceRecords.filter(r => r.appointmentId === appt.id);
assert(all.length === 2, '共两条记录（一新一废）');
assert(all.filter(r => !r.voided).length === 1, '仅一条有效');
assert(membership().totalSpent === spentBefore + service.price, '累计消费再次增加');

console.log('7. 爽约与取消（终态不可再流转）');
const mk = (id: string, status: Appointment['status']): Appointment => ({ ...appt, id, status });
store.dispatch(addAppointment(mk('TEST-APPT-2', 'pending')));
store.dispatch(changeAppointmentStatus({ id: 'TEST-APPT-2', status: 'no_show' }));
let a2 = store.getState().app.appointments.find(x => x.id === 'TEST-APPT-2')!;
assert(a2.status === 'no_show', '待确认可直接标爽约');
store.dispatch(changeAppointmentStatus({ id: 'TEST-APPT-2', status: 'confirmed' }));
a2 = store.getState().app.appointments.find(x => x.id === 'TEST-APPT-2')!;
assert(a2.status === 'no_show', '爽约后不可再流转');

store.dispatch(addAppointment(mk('TEST-APPT-3', 'pending')));
store.dispatch(changeAppointmentStatus({ id: 'TEST-APPT-3', status: 'cancelled' }));
const a3 = store.getState().app.appointments.find(x => x.id === 'TEST-APPT-3')!;
assert(a3.status === 'cancelled', '待确认可取消');
assert(a3.statusHistory?.length === 1, '取消留一条记录');
assert(store.getState().app.serviceRecords.filter(r => r.appointmentId === 'TEST-APPT-3').length === 0, '取消不产生消费记录');

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
