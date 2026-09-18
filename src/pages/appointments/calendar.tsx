import React, { useState } from 'react';
import {
  Row,
  Col,
  Card,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  Select,
  DatePicker,
  TimePicker,
  message,
  List,
  Avatar,
  Tooltip,
  Input
} from 'antd';
import {
  PlusOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  RollbackOutlined,
  HistoryOutlined,
  UserOutlined
} from '@ant-design/icons';
import Calendar from 'react-calendar';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import {
  addAppointment,
  changeAppointmentStatus,
  completeAppointment,
  voidServiceRecord,
  addWaitList
} from '../../store';
import type { Appointment, WaitList } from '../../types';
import { formatDate, formatDateTime, formatTime, formatCurrency, generateId, getStatusText, getStatusColor } from '../../utils/format';
import dayjs from 'dayjs';

const AppointmentCalendar: React.FC = () => {
  const dispatch = useDispatch();
  const state = useSelector((state: RootState) => state.app);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [historyAppointment, setHistoryAppointment] = useState<Appointment | null>(null);
  const [form] = Form.useForm();

  const selectedDateStr = dayjs(selectedDate).format('YYYY-MM-DD');

  const dayAppointments = state.appointments
    .filter((a) => a.startTime.split('T')[0] === selectedDateStr)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const waitListItems = state.waitList.filter((w) => w.status === 'waiting');

  const getTileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null;
    const dateStr = dayjs(date).format('YYYY-MM-DD');
    const count = state.appointments.filter((a) => a.startTime.split('T')[0] === dateStr).length;
    if (count > 0) {
      return (
        <div className="react-calendar__tile-dots">
          {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
            <div key={i} className="react-calendar__tile-dot" />
          ))}
        </div>
      );
    }
    return null;
  };

  const handleAdd = () => {
    form.resetFields();
    form.setFieldsValue({
      date: dayjs(selectedDate),
      source: 'wechat',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const startTime = dayjs(values.date)
        .hour(values.time.hour())
        .minute(values.time.minute());
      const service = state.services.find((s) => s.id === values.serviceId);
      const duration = service?.duration || 60;
      const endTime = startTime.add(duration, 'minute');

      const newAppointment: Appointment = {
        id: generateId(),
        customerId: values.customerId,
        serviceId: values.serviceId,
        employeeId: values.employeeId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration,
        status: 'pending',
        source: values.source,
        notes: values.notes || '',
        reminderSent: false,
      };

      const hasConflict = state.appointments.some((a) => {
        if (a.employeeId !== values.employeeId || a.status === 'cancelled' || a.status === 'no_show') return false;
        const aStart = new Date(a.startTime).getTime();
        const aEnd = new Date(a.endTime).getTime();
        const newStart = startTime.valueOf();
        const newEnd = endTime.valueOf();
        return (newStart >= aStart && newStart < aEnd) || (newEnd > aStart && newEnd <= aEnd);
      });

      if (hasConflict) {
        Modal.confirm({
          title: '时段冲突',
          content: '该美容师此时段已有预约，是否加入候补队列？',
          okText: '加入候补',
          cancelText: '取消',
          onOk: () => {
            const waitItem: WaitList = {
              id: generateId(),
              customerId: values.customerId,
              serviceId: values.serviceId,
              preferredDate: dayjs(values.date).toISOString(),
              addedAt: new Date().toISOString(),
              status: 'waiting',
            };
            dispatch(addWaitList(waitItem));
            message.success('已加入候补队列');
          },
        });
        setIsModalOpen(false);
        return;
      }

      dispatch(addAppointment(newAppointment));
      message.success('预约成功');
      setIsModalOpen(false);
    } catch {
      // validation error
    }
  };

  const handleConfirm = (appointment: Appointment) => {
    dispatch(changeAppointmentStatus({ id: appointment.id, toStatus: 'confirmed' }));
    message.success('预约已确认');
  };

  const handleComplete = (appointment: Appointment) => {
    const service = state.services.find((s) => s.id === appointment.serviceId);
    Modal.confirm({
      title: '完成服务',
      content: `确认完成该预约？将按项目价格 ${formatCurrency(service?.price ?? 0)} 生成一条消费记录，计入 ${state.employees.find((e) => e.id === appointment.employeeId)?.name || '对应美容师'} 名下。`,
      okText: '确认完成',
      cancelText: '再想想',
      onOk: () => {
        dispatch(completeAppointment(appointment.id));
        message.success(`已完成，并生成消费记录 ${formatCurrency(service?.price ?? 0)}`);
      },
    });
  };

  const handleNoShow = (appointment: Appointment) => {
    Modal.confirm({
      title: '标记爽约',
      content: '顾客未到店且未提前取消？爽约会单独计入顾客的到店率统计。',
      okText: '标记爽约',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        dispatch(changeAppointmentStatus({ id: appointment.id, toStatus: 'no_show' }));
        message.success('已标记为爽约');
      },
    });
  };

  const handleCancel = (appointment: Appointment) => {
    Modal.confirm({
      title: '取消预约',
      content: '确定要取消该预约吗？取消记录会保留并计入顾客的取消统计。',
      okText: '取消预约',
      okButtonProps: { danger: true },
      cancelText: '返回',
      onOk: () => {
        dispatch(changeAppointmentStatus({ id: appointment.id, toStatus: 'cancelled' }));
        message.success('预约已取消');
      },
    });
  };

  const handleVoid = (appointment: Appointment) => {
    const record = state.serviceRecords.find(
      (r) => r.appointmentId === appointment.id && r.status !== 'voided'
    );
    if (!record) {
      message.warning('未找到该预约对应的消费记录');
      return;
    }
    Modal.confirm({
      title: '作废消费记录',
      content: `将作废消费记录 ${formatCurrency(record.price)}，会员累计消费与积分同步扣回，预约退回「已确认」。确定作废吗？`,
      okText: '确认作废',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        dispatch(voidServiceRecord(record.id));
        message.success('消费记录已作废，预约已退回已确认');
      },
    });
  };

  const availableEmployees = (serviceId: string) => {
    return state.employees.filter(
      (e) =>
        (e.role === 'beautician' || e.role === 'technician') &&
        e.status === 'active' &&
        (e.skills.includes(serviceId) || serviceId === undefined)
    );
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-header-title">预约排期</h1>
          <p className="page-header-subtitle">
            {formatDate(selectedDate)} 预约管理
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增预约
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card className="card-wrapper" title="预约日历" bordered={false}>
            <Calendar
              value={selectedDate}
              onChange={(date) => setSelectedDate(date as Date)}
              tileContent={getTileContent}
              formatDay={(locale, date) => dayjs(date).format('D')}
            />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card
            className="card-wrapper"
            title={`${formatDate(selectedDate)} 预约详情`}
            bordered={false}
            extra={
              <Tag color="blue">{dayAppointments.length} 个预约</Tag>
            }
          >
            {dayAppointments.length > 0 ? (
              dayAppointments.map((appointment) => {
                const customer = state.customers.find((c) => c.id === appointment.customerId);
                const service = state.services.find((s) => s.id === appointment.serviceId);
                const employee = state.employees.find((e) => e.id === appointment.employeeId);

                return (
                  <div
                    key={appointment.id}
                    className={`appointment-slot ${appointment.status}`}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <Space>
                          <Avatar size={32} src={customer?.avatar} icon={<UserOutlined />} />
                          <div>
                            <div style={{ fontWeight: 500 }}>{customer?.name}</div>
                            <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                              {service?.name} · {employee?.name}
                            </div>
                          </div>
                        </Space>
                      </div>
                      <Space direction="vertical" align="end" size={4}>
                        <Space>
                          <ClockCircleOutlined style={{ color: '#C9A86C' }} />
                          <span style={{ fontWeight: 600, color: '#C9A86C' }}>
                            {formatTime(appointment.startTime)}
                          </span>
                        </Space>
                        <Tag color={getStatusColor(appointment.status)}>
                          {getStatusText(appointment.status)}
                        </Tag>
                      </Space>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <Button
                        type="text"
                        size="small"
                        icon={<HistoryOutlined />}
                        onClick={() => setHistoryAppointment(appointment)}
                      >
                        流转记录
                      </Button>
                      <Space size={0} wrap>
                        {appointment.status === 'pending' && (
                          <Button
                            type="link"
                            size="small"
                            icon={<CheckOutlined />}
                            onClick={() => handleConfirm(appointment)}
                          >
                            确认
                          </Button>
                        )}
                        {appointment.status === 'confirmed' && (
                          <Button
                            type="link"
                            size="small"
                            icon={<CheckCircleOutlined />}
                            onClick={() => handleComplete(appointment)}
                          >
                            完成
                          </Button>
                        )}
                        {(appointment.status === 'pending' || appointment.status === 'confirmed') && (
                          <>
                            <Button
                              type="link"
                              size="small"
                              danger
                              icon={<CloseCircleOutlined />}
                              onClick={() => handleNoShow(appointment)}
                            >
                              爽约
                            </Button>
                            <Button
                              type="link"
                              size="small"
                              danger
                              onClick={() => handleCancel(appointment)}
                            >
                              取消
                            </Button>
                          </>
                        )}
                        {appointment.status === 'completed' && (
                          <Button
                            type="link"
                            size="small"
                            danger
                            icon={<RollbackOutlined />}
                            onClick={() => handleVoid(appointment)}
                          >
                            作废
                          </Button>
                        )}
                      </Space>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">
                <CalendarOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
                <div style={{ marginTop: 16 }}>当日暂无预约</div>
              </div>
            )}
          </Card>

          {waitListItems.length > 0 && (
            <Card
              className="card-wrapper"
              title="候补队列"
              bordered={false}
              style={{ marginTop: 16 }}
            >
              <List
                size="small"
                dataSource={waitListItems}
                renderItem={(item) => {
                  const customer = state.customers.find((c) => c.id === item.customerId);
                  const service = state.services.find((s) => s.id === item.serviceId);
                  return (
                    <List.Item>
                      <List.Item.Meta
                        avatar={<Avatar size={32} src={customer?.avatar} />}
                        title={customer?.name}
                        description={`${service?.name} · ${formatDate(item.preferredDate)}`}
                      />
                      <Tag color="orange">候补中</Tag>
                    </List.Item>
                  );
                }}
              />
            </Card>
          )}
        </Col>
      </Row>

      <Modal
        title="新增预约"
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => setIsModalOpen(false)}
        okText="确认预约"
        cancelText="取消"
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="customerId"
            label="选择顾客"
            rules={[{ required: true, message: '请选择顾客' }]}
          >
            <Select
              placeholder="搜索并选择顾客"
              showSearch
              optionFilterProp="label"
              options={state.customers.map((c) => ({
                value: c.id,
                label: `${c.name} - ${c.phone}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="serviceId"
            label="选择项目"
            rules={[{ required: true, message: '请选择项目' }]}
          >
            <Select
              placeholder="请选择项目"
              options={state.services.map((s) => ({
                value: s.id,
                label: `${s.name} - ${formatCurrency(s.price)} (${s.duration}分钟)`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="employeeId"
            label="选择美容师"
            rules={[{ required: true, message: '请选择美容师' }]}
          >
            <Select
              placeholder="请选择美容师"
              options={state.employees
                .filter((e) => (e.role === 'beautician' || e.role === 'technician') && e.status === 'active')
                .map((e) => ({
                  value: e.id,
                  label: `${e.name} - ${getStatusText(e.role)}`,
                }))}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="date"
                label="选择日期"
                rules={[{ required: true, message: '请选择日期' }]}
              >
                <DatePicker style={{ width: '100%' }} disabledDate={(d) => d && d.isBefore(dayjs().startOf('day'))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="time"
                label="选择时间"
                rules={[{ required: true, message: '请选择时间' }]}
              >
                <TimePicker
                  style={{ width: '100%' }}
                  format="HH:mm"
                  minuteStep={15}
                  disabledHours={() => [0, 1, 2, 3, 4, 5, 6, 7, 8, 21, 22, 23]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="source" label="预约来源" initialValue="wechat">
            <Select
              options={[
                { value: 'phone', label: '电话' },
                { value: 'wechat', label: '微信' },
                { value: 'walk_in', label: '到店' },
                { value: 'online', label: '线上' },
              ]}
            />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="请输入备注" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="预约流转记录"
        open={!!historyAppointment}
        onCancel={() => setHistoryAppointment(null)}
        footer={null}
        width={480}
      >
        {historyAppointment && (() => {
          const logs = state.appointmentLogs
            .filter((l) => l.appointmentId === historyAppointment.id)
            .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
          return logs.length > 0 ? (
            <List
              size="small"
              dataSource={logs}
              renderItem={(log) => (
                <List.Item key={log.id}>
                  <List.Item.Meta
                    title={
                      <Space size={4}>
                        {log.fromStatus && (
                          <>
                            <Tag color={getStatusColor(log.fromStatus)}>{getStatusText(log.fromStatus)}</Tag>
                            <span style={{ color: '#8c8c8c' }}>→</span>
                          </>
                        )}
                        <Tag color={getStatusColor(log.toStatus)}>{getStatusText(log.toStatus)}</Tag>
                      </Space>
                    }
                    description={`${formatDateTime(log.changedAt)} · ${log.note}`}
                  />
                </List.Item>
              )}
            />
          ) : (
            <div className="empty-state">暂无流转记录</div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default AppointmentCalendar;
