import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  limit
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { Assignment, AcceptedFileType, AssignmentStatus } from '../types';

/**
 * Generate unambiguous 6-character uppercase alphanumeric code
 * Excludes easily confused characters: 0, O, 1, I, L
 */
export function generateAssignmentCode(): string {
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export interface CreateAssignmentParams {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  sec: string;
  title: string;
  description: string;
  acceptedTypes: AcceptedFileType[];
  openAt: string;
  closeAt: string;
  allowLate: boolean;
  allowResubmit: boolean;
  maxFileSizeMB: number;
  worksheetUrl?: string;
  worksheetName?: string;
  gasWebAppUrl?: string;
  instructorId: string;
  instructorEmail: string;
}

export async function createAssignment(params: CreateAssignmentParams): Promise<Assignment> {
  const code = generateAssignmentCode();
  const assignmentId = `assign_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newAssignment: Assignment = {
    id: assignmentId,
    code,
    courseId: params.courseId,
    courseCode: params.courseCode,
    courseTitle: params.courseTitle,
    sec: params.sec || 'ALL',
    title: params.title.trim(),
    description: params.description.trim(),
    acceptedTypes: params.acceptedTypes.length > 0 ? params.acceptedTypes : ['pdf', 'doc', 'image', 'link'],
    openAt: params.openAt,
    closeAt: params.closeAt,
    allowLate: params.allowLate,
    allowResubmit: params.allowResubmit,
    maxFileSizeMB: params.maxFileSizeMB || 10,
    worksheetUrl: params.worksheetUrl?.trim() || '',
    worksheetName: params.worksheetName?.trim() || '',
    gasWebAppUrl: params.gasWebAppUrl?.trim() || '',
    status: 'open',
    instructorId: params.instructorId,
    instructorEmail: params.instructorEmail,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'assignments', assignmentId), newAssignment);
    return newAssignment;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `assignments/${assignmentId}`);
  }
}

/**
 * Public search for assignment by 6-digit code (used by student portal)
 */
export async function getAssignmentByCode(code: string): Promise<Assignment | null> {
  const cleanCode = code.trim().toUpperCase();
  try {
    const q = query(
      collection(db, 'assignments'),
      where('code', '==', cleanCode),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }
    return snapshot.docs[0].data() as Assignment;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'assignments');
  }
}

export async function getAssignmentById(assignmentId: string): Promise<Assignment | null> {
  try {
    const d = await getDoc(doc(db, 'assignments', assignmentId));
    if (!d.exists()) return null;
    return d.data() as Assignment;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `assignments/${assignmentId}`);
  }
}

export async function getAssignmentsByInstructor(instructorId: string): Promise<Assignment[]> {
  try {
    const q = query(collection(db, 'assignments'), where('instructorId', '==', instructorId));
    const snapshot = await getDocs(q);
    const list: Assignment[] = [];
    snapshot.forEach((d) => list.push(d.data() as Assignment));
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'assignments');
  }
}

export async function updateAssignment(
  assignmentId: string,
  updates: Partial<Assignment>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'assignments', assignmentId), {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `assignments/${assignmentId}`);
  }
}

export async function toggleAssignmentStatus(
  assignmentId: string,
  newStatus: AssignmentStatus
): Promise<void> {
  return updateAssignment(assignmentId, { status: newStatus });
}

export async function extendAssignmentDeadline(
  assignmentId: string,
  newCloseAt: string
): Promise<void> {
  return updateAssignment(assignmentId, { closeAt: newCloseAt });
}

export async function deleteAssignment(assignmentId: string): Promise<void> {
  try {
    // 1. Fetch any submissions associated with this assignment
    const submissionsQuery = query(
      collection(db, 'submissions'),
      where('assignmentId', '==', assignmentId)
    );
    const submissionsSnap = await getDocs(submissionsQuery);

    // 2. Delete all associated submissions in batches (Firestore limit: 500 ops per batch)
    const subDocs = submissionsSnap.docs;
    const chunkSize = 400;
    for (let i = 0; i < subDocs.length; i += chunkSize) {
      const chunk = subDocs.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((subDoc) => {
        batch.delete(subDoc.ref);
      });
      await batch.commit();
    }

    // 3. Delete the target assignment document
    await deleteDoc(doc(db, 'assignments', assignmentId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `assignments/${assignmentId}`);
  }
}

