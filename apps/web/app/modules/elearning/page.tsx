'use client';

import { useState } from 'react';
import { useUserRole } from '../../../components/user-role-context';
import { ElearningOperationsBoard } from '../../../components/elearning-operations-board';
import { ElearningMyCourses } from '../../../components/elearning-my-courses';
import { ElearningLessonViewer } from '../../../components/elearning-lesson-viewer';
import { ElearningHrDashboard } from '../../../components/elearning-hr-dashboard';
import { ElearningCourseDetail } from '../../../components/elearning-course-detail';

type SubView =
  | { kind: 'main' }
  | { kind: 'course'; courseId: string }
  | { kind: 'course-detail'; courseId: string }
  | { kind: 'hr-dashboard' };

export default function ElearningPage() {
  const { role, userEmail } = useUserRole();
  const isAdmin = role === 'ADMIN';
  const [subView, setSubView] = useState<SubView>({ kind: 'main' });

  // Sub-view: Admin course detail editor
  if (subView.kind === 'course-detail') {
    return (
      <ElearningCourseDetail
        courseId={subView.courseId}
        onBack={() => setSubView({ kind: 'main' })}
      />
    );
  }

  // Sub-view: lesson viewer (employee)
  if (subView.kind === 'course') {
    return (
      <ElearningLessonViewer
        courseId={subView.courseId}
        onBack={() => setSubView({ kind: 'main' })}
      />
    );
  }

  // Sub-view: HR dashboard
  if (subView.kind === 'hr-dashboard') {
    return <ElearningHrDashboard />;
  }

  // Main view: Admin → ops board (with onOpenCourse), Employee → my courses
  if (isAdmin) {
    return (
      <ElearningOperationsBoard
        onOpenCourse={(courseId) => setSubView({ kind: 'course-detail', courseId })}
      />
    );
  }

  return (
    <ElearningMyCourses
      onOpenCourse={(courseId) => setSubView({ kind: 'course', courseId })}
    />
  );
}
