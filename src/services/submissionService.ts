import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { Submission, SubmissionStatus, Assignment, RosterLookup, Student } from '../types';

export function generateReceiptId(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `REC-${dateStr}-${randomSuffix}`;
}

/**
 * Isolated student lookup for verification prior to submission
 * Reads specific document without enumerating whole roster
 */
export async function lookupStudent(
  courseId: string,
  rawStudentId: string
): Promise<RosterLookup | null> {
  const cleanId = rawStudentId.trim().replace(/[^0-9A-Za-z-]/g, '');
  if (!cleanId) return null;

  const lookupDocId = `${courseId}_${cleanId}`;
  try {
    const docSnap = await getDoc(doc(db, 'rosterLookup', lookupDocId));
    if (!docSnap.exists()) {
      return null;
    }
    return docSnap.data() as RosterLookup;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `rosterLookup/${lookupDocId}`);
  }
}

export interface SubmitAssignmentParams {
  assignment: Assignment;
  student: RosterLookup;
  submissionType: 'file' | 'link';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  workLink?: string;
}

export async function submitStudentWork(params: SubmitAssignmentParams): Promise<Submission> {
  const { assignment, student, submissionType, fileUrl, fileName, fileSize, workLink } = params;

  const now = new Date();
  const openTime = new Date(assignment.openAt);
  const closeTime = new Date(assignment.closeAt);

  if (assignment.status === 'closed') {
    throw new Error('งานนี้ถูกปิดรับงานโดยผู้สอนแล้ว');
  }

  if (now < openTime) {
    throw new Error(`งานนี้ยังไม่เปิดรับ (เปิดรับวันที่ ${openTime.toLocaleString('th-TH')})`);
  }

  let status: SubmissionStatus = 'on_time';
  if (now > closeTime) {
    if (!assignment.allowLate) {
      throw new Error(`หมดเวลาส่งงานแล้วเมื่อ ${closeTime.toLocaleString('th-TH')} และไม่อนุญาตให้ส่งช้า`);
    }
    status = 'late';
  }

  const submissionDocId = `${assignment.id}_${student.studentId}`;
  const subRef = doc(db, 'submissions', submissionDocId);

  // Check existing submission
  const existingSnap = await getDoc(subRef);
  if (existingSnap.exists()) {
    if (!assignment.allowResubmit && now <= closeTime) {
      throw new Error('คุณได้ส่งงานนี้ไปแล้ว และงานนี้ไม่อนุญาตให้ส่งซ้ำ');
    }
  }

  const receiptId = generateReceiptId();
  const submissionData: Submission = {
    id: submissionDocId,
    assignmentId: assignment.id,
    assignmentCode: assignment.code,
    courseId: assignment.courseId,
    sec: student.sec,
    studentNo: student.studentNo,
    studentId: student.studentId,
    studentName: student.fullName,
    status,
    submissionType,
    fileUrl: fileUrl || '',
    fileName: fileName || '',
    fileSize: fileSize || 0,
    workLink: workLink || '',
    receiptId,
    submittedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    instructorOverride: false,
  };

  try {
    await setDoc(subRef, submissionData);
    return submissionData;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `submissions/${submissionDocId}`);
  }
}

export async function getStudentSubmission(
  assignmentId: string,
  studentId: string
): Promise<Submission | null> {
  const docId = `${assignmentId}_${studentId}`;
  try {
    const snap = await getDoc(doc(db, 'submissions', docId));
    if (!snap.exists()) return null;
    return snap.data() as Submission;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `submissions/${docId}`);
  }
}

export function subscribeToAssignmentSubmissions(
  assignmentId: string,
  onData: (submissions: Submission[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, 'submissions'), where('assignmentId', '==', assignmentId));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Submission[] = [];
      snapshot.forEach((d) => list.push(d.data() as Submission));
      // Sort by submission time descending
      list.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, `submissions?assignmentId=${assignmentId}`);
    }
  );
}

export async function overrideSubmissionStatus(
  submissionId: string,
  newStatus: SubmissionStatus,
  feedback?: string,
  score?: number | null
): Promise<void> {
  const subRef = doc(db, 'submissions', submissionId);
  const updates: Partial<Submission> = {
    status: newStatus,
    instructorOverride: true,
    updatedAt: new Date().toISOString(),
  };

  if (feedback !== undefined) updates.feedback = feedback;
  if (score !== undefined) updates.score = score;

  try {
    await updateDoc(subRef, updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `submissions/${submissionId}`);
  }
}

/**
 * Creates formatted CSV with Thai UTF-8 BOM (\uFEFF) for Microsoft Excel and Google Sheets
 */
export function exportSubmissionsToCsv(
  assignment: Assignment,
  submissions: Submission[],
  allStudents: Student[]
): string {
  const statusLabels: Record<SubmissionStatus, string> = {
    on_time: 'ส่งตรงเวลา',
    late: 'ส่งช้า',
    missing: 'ยังไม่ส่ง',
    personal_leave: 'ลากิจ',
    sick_leave: 'ลาป่วย',
  };

  const headers = [
    'ลำดับ',
    'เลขที่',
    'รหัสนักศึกษา',
    'ชื่อ-นามสกุล',
    'กลุ่มเรียน (Sec)',
    'สถานะการส่ง',
    'วัน-เวลาที่ส่ง',
    'รหัสใบเสร็จ (Receipt ID)',
    'ประเภทงาน',
    'ชื่อไฟล์ / ลิงก์งาน',
    'คะแนน',
    'ข้อเสนอแนะอาจารย์',
  ];

  // Map submissions by studentId for fast cross-referencing
  const subMap = new Map<string, Submission>();
  submissions.forEach((s) => subMap.set(s.studentId, s));

  // Merge with full roster so students who haven't submitted appear as 'missing'
  interface RowItem {
    no: string;
    studentId: string;
    name: string;
    sec: string;
    status: SubmissionStatus;
    submittedAt: string;
    receiptId: string;
    type: string;
    fileOrLink: string;
    score: string;
    feedback: string;
  }

  const rows: RowItem[] = [];

  // Filter roster if assignment is for a specific section
  const targetStudents =
    assignment.sec === 'ALL'
      ? allStudents
      : allStudents.filter((s) => s.sec === assignment.sec);

  if (targetStudents.length > 0) {
    targetStudents.forEach((st) => {
      const sub = subMap.get(st.studentId);
      if (sub) {
        rows.push({
          no: st.studentNo || sub.studentNo,
          studentId: st.studentId,
          name: st.fullName,
          sec: st.sec,
          status: sub.status,
          submittedAt: new Date(sub.submittedAt).toLocaleString('th-TH'),
          receiptId: sub.receiptId,
          type: sub.submissionType === 'file' ? 'ไฟล์งาน' : 'ลิงก์งาน',
          fileOrLink: sub.fileUrl || sub.workLink || '',
          score: sub.score !== undefined && sub.score !== null ? String(sub.score) : '',
          feedback: sub.feedback || '',
        });
      } else {
        rows.push({
          no: st.studentNo,
          studentId: st.studentId,
          name: st.fullName,
          sec: st.sec,
          status: 'missing',
          submittedAt: '-',
          receiptId: '-',
          type: '-',
          fileOrLink: '-',
          score: '',
          feedback: '',
        });
      }
    });
  } else {
    // Fallback to only submissions if roster wasn't loaded
    submissions.forEach((sub) => {
      rows.push({
        no: sub.studentNo,
        studentId: sub.studentId,
        name: sub.studentName,
        sec: sub.sec,
        status: sub.status,
        submittedAt: new Date(sub.submittedAt).toLocaleString('th-TH'),
        receiptId: sub.receiptId,
        type: sub.submissionType === 'file' ? 'ไฟล์งาน' : 'ลิงก์งาน',
        fileOrLink: sub.fileUrl || sub.workLink || '',
        score: sub.score !== undefined && sub.score !== null ? String(sub.score) : '',
        feedback: sub.feedback || '',
      });
    });
  }

  // Sort by section then student number
  rows.sort((a, b) => {
    if (a.sec !== b.sec) return a.sec.localeCompare(b.sec);
    const numA = parseInt(a.no, 10);
    const numB = parseInt(b.no, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.studentId.localeCompare(b.studentId);
  });

  const csvRows = [headers.join(',')];

  rows.forEach((r, idx) => {
    const fields = [
      idx + 1,
      `"${r.no}"`,
      `"${r.studentId}"`,
      `"${r.name.replace(/"/g, '""')}"`,
      `"${r.sec}"`,
      `"${statusLabels[r.status] || r.status}"`,
      `"${r.submittedAt}"`,
      `"${r.receiptId}"`,
      `"${r.type}"`,
      `"${(r.fileOrLink || '').replace(/"/g, '""')}"`,
      `"${r.score}"`,
      `"${(r.feedback || '').replace(/"/g, '""')}"`,
    ];
    csvRows.push(fields.join(','));
  });

  // \uFEFF is UTF-8 Byte Order Mark for Excel Thai language support
  return '\uFEFF' + csvRows.join('\r\n');
}

/**
 * Delete a student submission record
 */
export async function deleteSubmission(submissionId: string): Promise<void> {
  const subDocRef = doc(db, 'submissions', submissionId);
  try {
    await deleteDoc(subDocRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `submissions/${submissionId}`);
  }
}
