import { configureStore, createSlice, PayloadAction, combineReducers } from '@reduxjs/toolkit';
import { storage } from '../utils/storage';
import { generateId } from '../utils/format';
import type {
  Customer,
  SkinAnalysis,
  Allergy,
  Membership,
  Service,
  Package,
  PackageItem,
  Employee,
  Appointment,
  ServiceRecord,
  Schedule,
  Review,
  Attendance,
  Commission,
  WaitList
} from '../types';
import {
  mockCustomers,
  mockSkinAnalyses,
  mockAllergies,
  mockMemberships,
  mockServices,
  mockPackages,
  mockPackageItems,
  mockEmployees,
  mockAppointments,
  mockServiceRecords,
  mockSchedules,
  mockReviews,
  mockAttendance,
  mockCommissions,
  mockWaitList
} from '../mock';

interface AppState {
  customers: Customer[];
  skinAnalyses: SkinAnalysis[];
  allergies: Allergy[];
  memberships: Membership[];
  services: Service[];
  packages: Package[];
  packageItems: PackageItem[];
  employees: Employee[];
  appointments: Appointment[];
  serviceRecords: ServiceRecord[];
  schedules: Schedule[];
  reviews: Review[];
  attendance: Attendance[];
  commissions: Commission[];
  waitList: WaitList[];
  initialized: boolean;
}

const STORAGE_KEY = 'app_state';

// 预约状态机：待确认/已确认可流转，已完成只能经由作废消费记录退回，已取消与爽约为终态
const ALLOWED_TRANSITIONS: Record<Appointment['status'], Appointment['status'][]> = {
  pending: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['completed', 'cancelled', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: []
};

const recalcMembershipLevel = (membership: Membership) => {
  if (membership.totalSpent > 30000) membership.level = 'diamond';
  else if (membership.totalSpent > 20000) membership.level = 'platinum';
  else if (membership.totalSpent > 10000) membership.level = 'gold';
  else if (membership.totalSpent > 5000) membership.level = 'silver';
  else membership.level = 'bronze';
};

const loadState = (): AppState => {
  try {
    const saved = storage.get<AppState>(STORAGE_KEY);
    if (saved && saved.initialized) {
      // Verify data integrity
      const firstCustomer = saved.customers[0];
      if (firstCustomer && firstCustomer.avatar && firstCustomer.avatar.includes('data:image/svg+xml;base64,')) {
        const b64 = firstCustomer.avatar.replace('data:image/svg+xml;base64,', '');
        try {
          atob(b64);
          return saved;
        } catch (e) {
          console.log('Detected corrupted data, regenerating...');
          storage.clear();
        }
      }
    }
  } catch (e) {
    console.log('Loading fresh data...');
  }

  const customers = mockCustomers();
  const customerIds = customers.map(c => c.id);
  const services = mockServices() as Service[];
  const serviceIds = services.map(s => s.id);
  const employees = mockEmployees() as Employee[];
  const employeeIds = employees.map(e => e.id);
  const packages = mockPackages() as Package[];

  return {
    customers,
    skinAnalyses: mockSkinAnalyses(customerIds),
    allergies: mockAllergies(customerIds),
    memberships: mockMemberships(customerIds),
    services,
    packages,
    packageItems: mockPackageItems(packages),
    employees,
    appointments: mockAppointments(customerIds, serviceIds, employeeIds),
    serviceRecords: mockServiceRecords(customerIds, serviceIds, employeeIds),
    schedules: mockSchedules(employeeIds),
    reviews: mockReviews(customerIds, employeeIds, serviceIds),
    attendance: mockAttendance(employeeIds),
    commissions: mockCommissions(employeeIds),
    waitList: mockWaitList(customerIds, serviceIds),
    initialized: true
  };
};

const initialState: AppState = loadState();

const saveState = (state: AppState) => {
  storage.set(STORAGE_KEY, state);
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    addCustomer: (state, action: PayloadAction<Customer>) => {
      state.customers.unshift(action.payload);
      saveState(state);
    },
    updateCustomer: (state, action: PayloadAction<Customer>) => {
      const index = state.customers.findIndex(c => c.id === action.payload.id);
      if (index !== -1) {
        state.customers[index] = action.payload;
        saveState(state);
      }
    },
    deleteCustomer: (state, action: PayloadAction<string>) => {
      state.customers = state.customers.filter(c => c.id !== action.payload);
      saveState(state);
    },
    addSkinAnalysis: (state, action: PayloadAction<SkinAnalysis>) => {
      state.skinAnalyses.unshift(action.payload);
      saveState(state);
    },
    addAllergy: (state, action: PayloadAction<Allergy>) => {
      state.allergies.unshift(action.payload);
      saveState(state);
    },
    updateAllergy: (state, action: PayloadAction<Allergy>) => {
      const index = state.allergies.findIndex(a => a.id === action.payload.id);
      if (index !== -1) {
        state.allergies[index] = action.payload;
        saveState(state);
      }
    },
    deleteAllergy: (state, action: PayloadAction<string>) => {
      state.allergies = state.allergies.filter(a => a.id !== action.payload);
      saveState(state);
    },
    addService: (state, action: PayloadAction<Service>) => {
      state.services.unshift(action.payload);
      saveState(state);
    },
    updateService: (state, action: PayloadAction<Service>) => {
      const index = state.services.findIndex(s => s.id === action.payload.id);
      if (index !== -1) {
        state.services[index] = action.payload;
        saveState(state);
      }
    },
    deleteService: (state, action: PayloadAction<string>) => {
      state.services = state.services.filter(s => s.id !== action.payload);
      saveState(state);
    },
    addPackage: (state, action: PayloadAction<Package>) => {
      state.packages.unshift(action.payload);
      saveState(state);
    },
    updatePackage: (state, action: PayloadAction<Package>) => {
      const index = state.packages.findIndex(p => p.id === action.payload.id);
      if (index !== -1) {
        state.packages[index] = action.payload;
        saveState(state);
      }
    },
    addAppointment: (state, action: PayloadAction<Appointment>) => {
      state.appointments.unshift(action.payload);
      saveState(state);
    },
    updateAppointment: (state, action: PayloadAction<Appointment>) => {
      const index = state.appointments.findIndex(a => a.id === action.payload.id);
      if (index !== -1) {
        state.appointments[index] = action.payload;
        saveState(state);
      }
    },
    deleteAppointment: (state, action: PayloadAction<string>) => {
      state.appointments = state.appointments.filter(a => a.id !== action.payload);
      saveState(state);
    },
    addEmployee: (state, action: PayloadAction<Employee>) => {
      state.employees.unshift(action.payload);
      saveState(state);
    },
    updateEmployee: (state, action: PayloadAction<Employee>) => {
      const index = state.employees.findIndex(e => e.id === action.payload.id);
      if (index !== -1) {
        state.employees[index] = action.payload;
        saveState(state);
      }
    },
    updateSchedule: (state, action: PayloadAction<Schedule>) => {
      const index = state.schedules.findIndex(s => s.id === action.payload.id);
      if (index !== -1) {
        state.schedules[index] = action.payload;
      } else {
        state.schedules.push(action.payload);
      }
      saveState(state);
    },
    addWaitList: (state, action: PayloadAction<WaitList>) => {
      state.waitList.unshift(action.payload);
      saveState(state);
    },
    updateWaitList: (state, action: PayloadAction<WaitList>) => {
      const index = state.waitList.findIndex(w => w.id === action.payload.id);
      if (index !== -1) {
        state.waitList[index] = action.payload;
        saveState(state);
      }
    },
    deleteWaitList: (state, action: PayloadAction<string>) => {
      state.waitList = state.waitList.filter(w => w.id !== action.payload);
      saveState(state);
    },
    addServiceRecord: (state, action: PayloadAction<ServiceRecord>) => {
      state.serviceRecords.unshift(action.payload);
      const membership = state.memberships.find(m => m.customerId === action.payload.customerId);
      if (membership) {
        membership.totalSpent += action.payload.price;
        membership.points += Math.floor(action.payload.price / 10);
        recalcMembershipLevel(membership);
      }
      saveState(state);
    },
    changeAppointmentStatus: (state, action: PayloadAction<{ id: string; status: Appointment['status']; note?: string }>) => {
      const appointment = state.appointments.find(a => a.id === action.payload.id);
      if (!appointment) return;
      const from = appointment.status;
      const to = action.payload.status;
      if (from === to || !ALLOWED_TRANSITIONS[from].includes(to)) return;

      appointment.status = to;
      appointment.statusHistory = [
        ...(appointment.statusHistory ?? []),
        { from, to, changedAt: new Date().toISOString(), note: action.payload.note }
      ];

      // 标记完成时按项目价格生成消费记录，落到预约对应的美容师名下；同一预约不重复生成
      if (to === 'completed') {
        const alreadyGenerated = state.serviceRecords.some(
          r => r.appointmentId === appointment.id && !r.voided
        );
        if (!alreadyGenerated) {
          const service = state.services.find(s => s.id === appointment.serviceId);
          const record: ServiceRecord = {
            id: generateId(),
            customerId: appointment.customerId,
            serviceId: appointment.serviceId,
            employeeId: appointment.employeeId,
            serviceDate: new Date().toISOString(),
            price: service?.price ?? 0,
            notes: '预约完成自动生成',
            appointmentId: appointment.id
          };
          state.serviceRecords.unshift(record);
          const membership = state.memberships.find(m => m.customerId === appointment.customerId);
          if (membership) {
            membership.totalSpent += record.price;
            membership.points += Math.floor(record.price / 10);
            recalcMembershipLevel(membership);
          }
        }
      }
      saveState(state);
    },
    voidServiceRecord: (state, action: PayloadAction<string>) => {
      const record = state.serviceRecords.find(r => r.id === action.payload);
      if (!record || record.voided) return;

      record.voided = true;
      record.voidedAt = new Date().toISOString();

      // 回退会员累计消费与积分
      const membership = state.memberships.find(m => m.customerId === record.customerId);
      if (membership) {
        membership.totalSpent = Math.max(0, membership.totalSpent - record.price);
        membership.points = Math.max(0, membership.points - Math.floor(record.price / 10));
        recalcMembershipLevel(membership);
      }

      // 连着预约一起退回已确认
      if (record.appointmentId) {
        const appointment = state.appointments.find(a => a.id === record.appointmentId);
        if (appointment && appointment.status === 'completed') {
          appointment.status = 'confirmed';
          appointment.statusHistory = [
            ...(appointment.statusHistory ?? []),
            {
              from: 'completed',
              to: 'confirmed',
              changedAt: new Date().toISOString(),
              note: '消费记录作废，预约退回已确认'
            }
          ];
        }
      }
      saveState(state);
    }
  }
});

export const {
  addCustomer,
  updateCustomer,
  deleteCustomer,
  addSkinAnalysis,
  addAllergy,
  updateAllergy,
  deleteAllergy,
  addService,
  updateService,
  deleteService,
  addPackage,
  updatePackage,
  addAppointment,
  updateAppointment,
  deleteAppointment,
  addEmployee,
  updateEmployee,
  updateSchedule,
  addWaitList,
  updateWaitList,
  deleteWaitList,
  addServiceRecord,
  changeAppointmentStatus,
  voidServiceRecord
} = appSlice.actions;

export const store = configureStore({
  reducer: {
    app: appSlice.reducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
