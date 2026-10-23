import {
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { Course, Student, RosterLookup } from '../types';

export async function createCourse(
  code: string,
  title: string,
  sections: string[],
  instructorId: string,
  instructorEmail: string
): Promise<Course> {
  const courseId = `course_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newCourse: Course = {
    id: courseId,
    code: code.trim().toUpperCase(),
    title: title.trim(),
    sections: sections.length > 0 ? sections : ['Sec 1'],
    instructorId,
    instructorEmail,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'courses', courseId), newCourse);
    return newCourse;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `courses/${courseId}`);
  }
}

export async function updateCourse(
  courseId: string,
  updates: Partial<Course>
): Promise<void> {
  try {
    const cleanUpdates: Record<string, any> = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    if (updates.code) cleanUpdates.code = updates.code.trim().toUpperCase();
    if (updates.title) cleanUpdates.title = updates.title.trim();
    if (updates.sections) {
      cleanUpdates.sections = Array.isArray(updates.sections) && updates.sections.length > 0
        ? updates.sections.map((s) => s.trim()).filter(Boolean)
        : ['Sec 1'];
    }
    await updateDoc(doc(db, 'courses', courseId), cleanUpdates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `courses/${courseId}`);
  }
}

export async function getCoursesByInstructor(instructorId: string): Promise<Course[]> {
  try {
    const q = query(collection(db, 'courses'), where('instructorId', '==', instructorId));
    const snapshot = await getDocs(q);
    const courses: Course[] = [];
    snapshot.forEach((d) => courses.push(d.data() as Course));
    return courses.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'courses');
  }
}

export async function deleteCourse(courseId: string): Promise<void> {
  try {
    // 1. Fetch any students in this course
    const studentsSnap = await getDocs(
      query(collection(db, 'students'), where('courseId', '==', courseId))
    );

    // 2. Fetch any rosterLookup in this course
    const lookupSnap = await getDocs(
      query(collection(db, 'rosterLookup'), where('courseId', '==', courseId))
    );

    // 3. Delete all roster records using writeBatch chunks of 400 ops
    const allRefsToDelete = [
      ...studentsSnap.docs.map((d) => d.ref),
      ...lookupSnap.docs.map((d) => d.ref),
    ];

    const chunkSize = 400;
    for (let i = 0; i < allRefsToDelete.length; i += chunkSize) {
      const chunk = allRefsToDelete.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    // 4. Delete the target course document
    await deleteDoc(doc(db, 'courses', courseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `courses/${courseId}`);
  }
}


export interface CSVParseResult {
  success: boolean;
  totalParsed: number;
  imported: number;
  sectionsFound: string[];
  errors: string[];
}

/**
 * Parses CSV text supporting UTF-8 and Thai characters, mapping headers flexibly
 */
export async function importStudentRoster(
  csvText: string,
  courseId: string,
  instructorId: string
): Promise<CSVParseResult> {
  // Strip BOM if present
  let cleanText = csvText;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.substring(1);
  }

  // Split lines
  const lines = cleanText
    .split(/\r\n|\n|\r/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new Error('ไฟล์ CSV ว่างเปล่า หรือไม่มีแถวข้อมูล (ต้องมีแถวหัวตารางและข้อมูลอย่างน้อย 1 แถว)');
  }

  // Detect delimiter from header line (commas, semicolons, tabs)
  const headerLine = lines[0];
  const delimiter = headerLine.includes('\t')
    ? '\t'
    : headerLine.includes(';') && !headerLine.includes(',')
    ? ';'
    : ',';

  // Parse header
  const headers = parseCSVLine(headerLine, delimiter).map((h) => h.toLowerCase().trim());

  let noIdx = headers.findIndex((h) => h.includes('เลขที่') || h.includes('no') || h === '#');
  let idIdx = headers.findIndex(
    (h) => h.includes('รหัส') || h.includes('studentid') || h.includes('student_id') || h === 'id'
  );
  let nameIdx = headers.findIndex(
    (h) => h.includes('ชื่อ') || h.includes('name') || h.includes('fullname') || h.includes('นิสิต')
  );
  let secIdx = headers.findIndex(
    (h) => h.includes('sec') || h.includes('กลุ่ม') || h.includes('ตอน')
  );
  let emailIdx = headers.findIndex((h) => h.includes('เมล') || h.includes('mail'));

  // Default fallback if indices not found by keyword
  if (idIdx === -1 && headers.length >= 2) idIdx = 1;
  if (nameIdx === -1 && headers.length >= 3) nameIdx = 2;
  if (noIdx === -1) noIdx = 0;
  if (secIdx === -1 && headers.length >= 4) secIdx = 3;

  if (idIdx === -1 || nameIdx === -1) {
    throw new Error('ไม่พบคอลัมน์ "รหัสนักศึกษา" หรือ "ชื่อ-นามสกุล" ในไฟล์ CSV');
  }

  let currentBatch = writeBatch(db);
  let batchOps = 0;
  const sectionsSet = new Set<string>();
  const errors: string[] = [];
  let importedCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i], delimiter);
    if (!row || row.length === 0 || !row.some((cell) => cell.trim().length > 0)) {
      continue;
    }

    const rawId = (row[idIdx] || '').trim().replace(/[^0-9A-Za-z-]/g, '');
    const rawName = (row[nameIdx] || '').trim();
    const rawNo = noIdx !== -1 && row[noIdx] ? row[noIdx].trim() : String(i);
    const rawSec = secIdx !== -1 && row[secIdx] ? row[secIdx].trim() : 'Sec 1';
    const rawEmail = emailIdx !== -1 && row[emailIdx] ? row[emailIdx].trim() : '';

    if (!rawId || !rawName) {
      errors.push(`แถวที่ ${i + 1}: รหัสหรือชื่อว่างเปล่า`);
      continue;
    }

    sectionsSet.add(rawSec);

    const studentDocId = `${courseId}_${rawId}`;
    const studentData: Student = {
      id: studentDocId,
      courseId,
      sec: rawSec,
      studentNo: rawNo,
      studentId: rawId,
      fullName: rawName,
      email: rawEmail,
      instructorId,
      createdAt: new Date().toISOString(),
    };

    // Full student record in `students`
    const studentRef = doc(db, 'students', studentDocId);
    currentBatch.set(studentRef, studentData);

    // Isolated student lookup record in `rosterLookup`
    const lookupRef = doc(db, 'rosterLookup', studentDocId);
    const lookupData: RosterLookup = {
      id: studentDocId,
      courseId,
      sec: rawSec,
      studentNo: rawNo,
      studentId: rawId,
      fullName: rawName,
      instructorId,
    };
    currentBatch.set(lookupRef, lookupData);

    importedCount++;
    batchOps += 2;

    // Firestore batch limit is 500 ops; commit every 400 ops (200 students)
    if (batchOps >= 400) {
      try {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        batchOps = 0;
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'students_and_rosterLookup');
      }
    }
  }

  if (batchOps > 0) {
    try {
      await currentBatch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'students_and_rosterLookup');
    }
  }

  return {
    success: true,
    totalParsed: lines.length - 1,
    imported: importedCount,
    sectionsFound: Array.from(sectionsSet),
    errors,
  };
}

/**
 * Simple CSV line parser handling quotes, escaped quotes, and custom delimiters
 */
function parseCSVLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}


export async function getStudentsByCourse(courseId: string): Promise<Student[]> {
  try {
    const q = query(collection(db, 'students'), where('courseId', '==', courseId));
    const snapshot = await getDocs(q);
    const list: Student[] = [];
    snapshot.forEach((d) => list.push(d.data() as Student));
    return list.sort((a, b) => {
      const noA = parseInt(a.studentNo, 10);
      const noB = parseInt(b.studentNo, 10);
      if (!isNaN(noA) && !isNaN(noB)) return noA - noB;
      return a.studentId.localeCompare(b.studentId);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'students');
  }
}
