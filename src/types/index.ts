export type SubmissionStatus = 'on_time' | 'late' | 'missing' | 'personal_leave' | 'sick_leave';
export type AcceptedFileType = 'pdf' | 'doc' | 'image' | 'link';
export type AssignmentStatus = 'open' | 'closed' | 'archived';

export interface Course {
  id: string;
  code: string;
  title: string;
  sections: string[];
  instructorId: string;
  instructorEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: string;
  courseId: string;
  sec: string;
  studentNo: string;
  studentId: string;
  fullName: string;
  email?: string;
  instructorId: string;
  createdAt: string;
}

export interface RosterLookup {
  id: string; // `${courseId}_${studentId}`
  courseId: string;
  sec: string;
  studentNo: string;
  studentId: string;
  fullName: string;
  instructorId: string;
}

export interface Assignment {
  id: string;
  code: string; // 6-digit code e.g. "K7M2P9"
  courseId: string;
  courseCode: string;
  courseTitle: string;
  sec: string; // "ALL" or specific section
  title: string;
  description: string;
  acceptedTypes: AcceptedFileType[];
  openAt: string; // ISO datetime
  closeAt: string; // ISO datetime
  allowLate: boolean;
  allowResubmit: boolean;
  maxFileSizeMB: number; // default 10
  worksheetUrl?: string;
  worksheetName?: string;
  gasWebAppUrl?: string; // Optional custom GAS URL for this assignment or course
  status: AssignmentStatus;
  instructorId: string;
  instructorEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface Submission {
  id: string; // `${assignmentId}_${studentId}`
  assignmentId: string;
  assignmentCode: string;
  courseId: string;
  sec: string;
  studentNo: string;
  studentId: string;
  studentName: string;
  status: SubmissionStatus;
  submissionType: 'file' | 'link';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  workLink?: string;
  receiptId: string;
  feedback?: string;
  score?: number | null;
  instructorOverride?: boolean;
  submittedAt: string; // ISO datetime
  updatedAt: string;
}

export interface TeacherSettings {
  defaultGasWebAppUrl?: string;
  instructorName?: string;
  department?: string;
}
