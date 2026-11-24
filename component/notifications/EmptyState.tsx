import React from 'react';
import EmptyNote from '@/component/ui/EmptyNote';

interface EmptyStateProps {
  message?: string;
  description?: string;
}

export function EmptyState({
  message = 'ยังไม่มีการแจ้งเตือนในหมวดหมู่นี้',
  description = 'เมื่อมีกิจกรรมใหม่ๆ เช่น การตอบกลับหรือรีแอคชัน จะแสดงขึ้นที่นี่',
}: EmptyStateProps) {
  return (
    <EmptyNote
      icon="bell"
      mascot="sleepy"
      title={message}
      description={description}
    />
  );
}
