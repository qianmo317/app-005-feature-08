import React from 'react';
import { Modal, Timeline, Tag, Space } from 'antd';
import type { Appointment } from '../types';
import { formatDateTime, getStatusColor, getStatusText } from '../utils/format';

interface AppointmentStatusHistoryProps {
  appointment: Appointment | null;
  onClose: () => void;
}

const AppointmentStatusHistory: React.FC<AppointmentStatusHistoryProps> = ({ appointment, onClose }) => {
  const history = appointment?.statusHistory ?? [];

  return (
    <Modal
      title="状态流转记录"
      open={!!appointment}
      onCancel={onClose}
      footer={null}
      width={420}
    >
      {history.length > 0 ? (
        <Timeline
          style={{ marginTop: 16 }}
          items={history.map((log) => ({
            color: getStatusColor(log.to),
            children: (
              <div>
                <Space size={4}>
                  <Tag>{getStatusText(log.from)}</Tag>
                  <span style={{ color: '#8c8c8c' }}>→</span>
                  <Tag color={getStatusColor(log.to)}>{getStatusText(log.to)}</Tag>
                </Space>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                  {formatDateTime(log.changedAt)}
                  {log.note ? ` · ${log.note}` : ''}
                </div>
              </div>
            ),
          }))}
        />
      ) : (
        <div className="empty-state">暂无流转记录</div>
      )}
    </Modal>
  );
};

export default AppointmentStatusHistory;
