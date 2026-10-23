import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  AlertCircle,
  BarChart3,
  Calendar,
  Check,
  CheckCircle,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileDown,
  FilePlus,
  FileSpreadsheet,
  FileText,
  Filter,
  Globe,
  GraduationCap,
  HardDrive,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  Link as LinkIcon,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Share2,
  ShieldAlert,
  Smile,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  UserCheck,
  Users,
  X
} from 'lucide-react';
import { Course, Assignment, Submission, Student, SubmissionStatus, AcceptedFileType } from '../types';
import { loginWithGoogle, logout } from '../firebase/config';
import {
  getCoursesByInstructor,
  createCourse,
  updateCourse,
  deleteCourse,
  importStudentRoster,
  getStudentsByCourse
} from '../services/courseService';
import {
  createAssignment,
  updateAssignment,
  getAssignmentsByInstructor,
  toggleAssignmentStatus,
  extendAssignmentDeadline,
  deleteAssignment
} from '../services/assignmentService';
import {
  subscribeToAssignmentSubmissions,
  overrideSubmissionStatus,
  exportSubmissionsToCsv,
  deleteSubmission
} from '../services/submissionService';
import { GAS_TEMPLATE_CODE, uploadFileToGoogleDriveViaGAS } from '../services/gasService';

// Authorized Instructor Email
export const AUTHORIZED_TEACHER_EMAIL = 'walailuk.p@bu.ac.th';
export const ALLOWED_INSTRUCTORS: string[] = [AUTHORIZED_TEACHER_EMAIL];


// Helper to check if a URL or filename represents a direct image format
export function isImageUrl(url: string, fileName?: string): boolean {
  if (!url) return false;
  const clean = url.trim();
  if (clean.startsWith('data:image/')) return true;
  const lowerUrl = clean.toLowerCase();
  const lowerName = (fileName || '').toLowerCase();
  return (
    /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)(\?.*)?$/i.test(lowerUrl) ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)$/i.test(lowerName)
  );
}

// Helper function to transform URLs into embeddable URLs for iframes
export function getEmbeddablePreviewUrl(url: string, fileName?: string): string {
  if (!url) return '';
  const cleanUrl = url.trim();

  // If not a valid web URL or data URL (e.g. "[ไฟล์แนบในระบบ]: ..."), don't use iframe to avoid loading SPA
  if (
    !cleanUrl.startsWith('http://') &&
    !cleanUrl.startsWith('https://') &&
    !cleanUrl.startsWith('data:') &&
    !cleanUrl.startsWith('blob:')
  ) {
    return '';
  }

  // Data URLs can be rendered directly
  if (cleanUrl.startsWith('data:')) {
    return cleanUrl;
  }

  // 1. Google Drive Files: extract fileId and return /preview
  // Matches: /file/d/FILE_ID/view, /open?id=FILE_ID, /uc?id=FILE_ID
  const driveFileMatch = cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveFileMatch && driveFileMatch[1]) {
    return `https://drive.google.com/file/d/${driveFileMatch[1]}/preview`;
  }
  const driveIdMatch = cleanUrl.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveIdMatch && driveIdMatch[1]) {
    return `https://drive.google.com/file/d/${driveIdMatch[1]}/preview`;
  }

  // 2. Google Docs / Sheets / Slides
  if (cleanUrl.includes('docs.google.com')) {
    if (cleanUrl.includes('/edit') || cleanUrl.includes('/view')) {
      return cleanUrl.replace(/\/edit(\?.*)?$/, '/preview').replace(/\/view(\?.*)?$/, '/preview');
    }
    if (!cleanUrl.includes('/preview')) {
      const parts = cleanUrl.split('?');
      return `${parts[0]}/preview${parts[1] ? '?' + parts[1] : ''}`;
    }
    return cleanUrl;
  }

  // 3. Canva Embed
  if (cleanUrl.includes('canva.com/design/')) {
    return cleanUrl.includes('?') ? `${cleanUrl}&embed` : `${cleanUrl}?embed`;
  }

  // 4. Direct PDF, Office Documents or raw download file URL
  const lowerUrl = cleanUrl.toLowerCase();
  const lowerName = (fileName || '').toLowerCase();
  if (
    lowerUrl.endsWith('.pdf') ||
    lowerName.endsWith('.pdf') ||
    lowerUrl.endsWith('.doc') ||
    lowerName.endsWith('.doc') ||
    lowerUrl.endsWith('.docx') ||
    lowerName.endsWith('.docx') ||
    lowerUrl.endsWith('.ppt') ||
    lowerName.endsWith('.ppt') ||
    lowerUrl.endsWith('.pptx') ||
    lowerName.endsWith('.pptx') ||
    lowerUrl.includes('.pdf?') ||
    lowerUrl.includes('export=download')
  ) {
    return `https://docs.google.com/gview?url=${encodeURIComponent(cleanUrl)}&embedded=true`;
  }

  // 5. Fallback: Return original URL
  return cleanUrl;
}

// Helpers for worksheet file upload and display
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getWorksheetIcon(fileName?: string) {
  const lower = (fileName || '').toLowerCase();
  if (lower.endsWith('.pdf')) {
    return <FileText className="w-5 h-5 text-rose-500" />;
  }
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) {
    return <FileText className="w-5 h-5 text-blue-600" />;
  }
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) {
    return <ImageIcon className="w-5 h-5 text-purple-500" />;
  }
  return <FileText className="w-5 h-5 text-indigo-500" />;
}

interface TeacherPortalProps {
  user: User | null;
  authLoading: boolean;
  onExitPortal?: () => void;
}

export const TeacherPortal: React.FC<TeacherPortalProps> = ({ user, authLoading, onExitPortal }) => {
  // Authorization check
  const isAuthorized = user?.email?.toLowerCase().trim() === AUTHORIZED_TEACHER_EMAIL.toLowerCase();

  // File Preview Modal State
  const [previewItem, setPreviewItem] = useState<{
    url: string;
    fileName?: string;
    type: 'file' | 'link';
    studentName: string;
    studentId: string;
  } | null>(null);
  const [iframeLoading, setIframeLoading] = useState(true);

  // Login State
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (isSigningIn || authLoading) return;
    setIsSigningIn(true);
    setLoginError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      if (err?.code === 'auth/popup-blocked') {
        setLoginError('เบราว์เซอร์บล็อกหน้าต่างเข้าสู่ระบบ กรุณาอนุญาตป๊อปอัปแล้วลองใหม่อีกครั้ง');
      } else if (err?.code !== 'auth/cancelled-popup-request' && err?.code !== 'auth/popup-closed-by-user') {
        setLoginError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'assignments' | 'create_assignment' | 'courses' | 'submissions' | 'gas_guide'>('assignments');

  // Courses & Rosters
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [courseStudents, setCourseStudents] = useState<Student[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);

  // New Course Modal / State
  const [showNewCourseModal, setShowNewCourseModal] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [newCourseSecs, setNewCourseSecs] = useState('Sec 1, Sec 2');

  // Edit Course Modal State
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editCourseCode, setEditCourseCode] = useState('');
  const [editCourseTitle, setEditCourseTitle] = useState('');
  const [editCourseSecs, setEditCourseSecs] = useState('');
  const [isUpdatingCourse, setIsUpdatingCourse] = useState(false);
  const [updateCourseError, setUpdateCourseError] = useState<string | null>(null);

  // Delete Course Modal State
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
  const [isDeletingCourse, setIsDeletingCourse] = useState(false);
  const [deleteCourseError, setDeleteCourseError] = useState<string | null>(null);

  // CSV Import State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResultMsg, setCsvResultMsg] = useState<{ success: boolean; message: string } | null>(null);
  const [isDraggingCsv, setIsDraggingCsv] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);


  // Assignments
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);

  // Create Assignment Form State
  const [assignTitle, setAssignTitle] = useState('');
  const [assignDesc, setAssignDesc] = useState('');
  const [assignCourseId, setAssignCourseId] = useState('');
  const [assignSec, setAssignSec] = useState('ALL');
  const [assignOpenAt, setAssignOpenAt] = useState('');
  const [assignCloseAt, setAssignCloseAt] = useState('');
  const [assignAllowLate, setAssignAllowLate] = useState(true);
  const [assignAllowResubmit, setAssignAllowResubmit] = useState(true);
  const [assignMaxMB, setAssignMaxMB] = useState(10);
  const [assignAcceptedTypes, setAssignAcceptedTypes] = useState<AcceptedFileType[]>(['pdf', 'doc', 'image', 'link']);
  const [assignWorksheetUrl, setAssignWorksheetUrl] = useState('');
  const [assignWorksheetName, setAssignWorksheetName] = useState('');
  const [assignGasUrl, setAssignGasUrl] = useState(localStorage.getItem('saved_gas_url') || '');
  const [assignCreating, setAssignCreating] = useState(false);

  // Worksheet Upload State (Create Assignment)
  const [worksheetFile, setWorksheetFile] = useState<File | null>(null);
  const [worksheetUploading, setWorksheetUploading] = useState(false);
  const [worksheetUploadProgress, setWorksheetUploadProgress] = useState<string | null>(null);
  const [worksheetUploadError, setWorksheetUploadError] = useState<string | null>(null);
  const [isDraggingWorksheet, setIsDraggingWorksheet] = useState(false);
  const [worksheetSourceMode, setWorksheetSourceMode] = useState<'upload' | 'url'>('upload');
  const worksheetFileInputRef = useRef<HTMLInputElement>(null);

  // Edit Assignment Modal State
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [editAssignTitle, setEditAssignTitle] = useState('');
  const [editAssignDesc, setEditAssignDesc] = useState('');
  const [editAssignCloseAt, setEditAssignCloseAt] = useState('');
  const [editAssignAllowLate, setEditAssignAllowLate] = useState(true);
  const [editAssignAllowResubmit, setEditAssignAllowResubmit] = useState(true);
  const [editAssignWorksheetName, setEditAssignWorksheetName] = useState('');
  const [editAssignWorksheetUrl, setEditAssignWorksheetUrl] = useState('');
  const [editWorksheetFile, setEditWorksheetFile] = useState<File | null>(null);
  const [editWorksheetUploading, setEditWorksheetUploading] = useState(false);
  const [editWorksheetProgress, setEditWorksheetProgress] = useState<string | null>(null);
  const [editWorksheetUploadError, setEditWorksheetUploadError] = useState<string | null>(null);
  const [isDraggingEditWorksheet, setIsDraggingEditWorksheet] = useState(false);
  const [editWorksheetSourceMode, setEditWorksheetSourceMode] = useState<'upload' | 'url'>('upload');
  const editWorksheetFileInputRef = useRef<HTMLInputElement>(null);
  const [isUpdatingAssign, setIsUpdatingAssign] = useState(false);
  const [editAssignError, setEditAssignError] = useState<string | null>(null);

  // Submissions State (Real-time)
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [secFilter, setSecFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // UI helpers
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [copiedGasCode, setCopiedGasCode] = useState(false);

  // Quick Extend Deadline Modal
  const [extendModalAssignment, setExtendModalAssignment] = useState<Assignment | null>(null);
  const [extendDatetime, setExtendDatetime] = useState('');

  // Delete Assignment Confirmation Modal
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Delete Submission Confirmation Modal
  const [deletingSubmission, setDeletingSubmission] = useState<Submission | null>(null);
  const [isDeletingSub, setIsDeletingSub] = useState(false);
  const [deleteSubError, setDeleteSubError] = useState<string | null>(null);


  // Initial load
  useEffect(() => {
    if (user && isAuthorized) {
      loadCourses();
      loadAssignments();
    }
  }, [user, isAuthorized]);

  // Set default dates for new assignment
  useEffect(() => {
    const now = new Date();
    const isoNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setAssignOpenAt(isoNow);
    setAssignCloseAt(nextWeek);
  }, []);

  // Auto-fill saved GAS URL when entering create assignment tab
  useEffect(() => {
    if (activeTab === 'create_assignment') {
      const saved = localStorage.getItem('saved_gas_url');
      if (saved && !assignGasUrl) {
        setAssignGasUrl(saved);
      }
    }
  }, [activeTab, assignGasUrl]);

  // Real-time listener when viewing submissions of an assignment
  useEffect(() => {
    if (!selectedAssignment) {
      setSubmissions([]);
      return;
    }
    setSubsLoading(true);
    const unsubscribe = subscribeToAssignmentSubmissions(
      selectedAssignment.id,
      (data) => {
        setSubmissions(data);
        setSubsLoading(false);
      },
      (err) => {
        console.error(err);
        setSubsLoading(false);
      }
    );

    getStudentsByCourse(selectedAssignment.courseId).then((sts) => {
      setCourseStudents(sts);
    });

    return () => unsubscribe();
  }, [selectedAssignment]);

  const loadCourses = async () => {
    if (!user) return;
    setCoursesLoading(true);
    try {
      const data = await getCoursesByInstructor(user.uid);
      setCourses(data);
      if (data.length > 0 && !selectedCourseId) {
        setSelectedCourseId(data[0].id);
        setAssignCourseId(data[0].id);
        loadStudents(data[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCoursesLoading(false);
    }
  };

  const loadStudents = async (courseId: string) => {
    if (!courseId) return;
    try {
      const list = await getStudentsByCourse(courseId);
      setCourseStudents(list);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAssignments = async () => {
    if (!user) return;
    setAssignmentsLoading(true);
    try {
      const data = await getAssignmentsByInstructor(user.uid);
      setAssignments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setAssignmentsLoading(false);
    }
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newCourseCode.trim() || !newCourseTitle.trim()) return;

    try {
      const sections = newCourseSecs
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const created = await createCourse(
        newCourseCode,
        newCourseTitle,
        sections,
        user.uid,
        user.email || ''
      );

      setCourses([created, ...courses]);
      setSelectedCourseId(created.id);
      setAssignCourseId(created.id);
      setShowNewCourseModal(false);
      setNewCourseCode('');
      setNewCourseTitle('');
      setNewCourseSecs('Sec 1, Sec 2');
    } catch (err: any) {
      alert('สร้างรายวิชาไม่สำเร็จ: ' + err.message);
    }
  };

  const handleUpdateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse || isUpdatingCourse) return;
    if (!editCourseCode.trim() || !editCourseTitle.trim()) {
      setUpdateCourseError('กรุณากรอกรหัสวิชาและชื่อวิชาให้ครบถ้วน');
      return;
    }

    setIsUpdatingCourse(true);
    setUpdateCourseError(null);
    try {
      const parsedSecs = editCourseSecs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const sections = parsedSecs.length > 0 ? parsedSecs : ['Sec 1'];

      await updateCourse(editingCourse.id, {
        code: editCourseCode.trim().toUpperCase(),
        title: editCourseTitle.trim(),
        sections,
      });

      setCourses((prev) =>
        prev.map((c) =>
          c.id === editingCourse.id
            ? {
                ...c,
                code: editCourseCode.trim().toUpperCase(),
                title: editCourseTitle.trim(),
                sections,
                updatedAt: new Date().toISOString(),
              }
            : c
        )
      );

      setEditingCourse(null);
    } catch (err: any) {
      console.error('Update course failed:', err);
      setUpdateCourseError('แก้ไขรายวิชาไม่สำเร็จ: ' + (err?.message || 'เกิดข้อผิดพลาด'));
    } finally {
      setIsUpdatingCourse(false);
    }
  };

  const handleConfirmDeleteCourse = async () => {
    if (!deletingCourseId || isDeletingCourse) return;
    setIsDeletingCourse(true);
    setDeleteCourseError(null);
    try {
      await deleteCourse(deletingCourseId);
      setCourses((prev) => prev.filter((c) => c.id !== deletingCourseId));
      if (selectedCourseId === deletingCourseId) {
        setSelectedCourseId('');
        setCourseStudents([]);
      }
      setDeletingCourseId(null);
    } catch (err: any) {
      console.error('Delete course failed:', err);
      setDeleteCourseError('ลบรายวิชาไม่สำเร็จ: ' + (err?.message || 'เกิดข้อผิดพลาด'));
    } finally {
      setIsDeletingCourse(false);
    }
  };

  const handleImportRoster = async () => {
    if (!csvFile || !selectedCourseId || !user) return;
    setCsvImporting(true);
    setCsvResultMsg(null);

    try {
      const text = await csvFile.text();
      const res = await importStudentRoster(text, selectedCourseId, user.uid);
      setCsvResultMsg({
        success: true,
        message: `นำเข้ารายชื่อสำเร็จ ${res.imported} คน จากทั้งหมด ${res.totalParsed} แถว (ตรวจพบกลุ่มเรียน: ${res.sectionsFound.join(', ') || 'ไม่มี'})`
      });
      loadStudents(selectedCourseId);
      setCsvFile(null);
      if (csvFileInputRef.current) {
        csvFileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error('Import roster failed:', err);
      setCsvResultMsg({
        success: false,
        message: 'นำเข้ารายชื่อไม่สำเร็จ: ' + (err?.message || 'เกิดข้อผิดพลาดในการนำเข้าไฟล์')
      });
    } finally {
      setCsvImporting(false);
    }
  };


  // Worksheet File Upload Handlers (Create & Edit)
  const handleWorksheetFileSelect = async (file: File, isEdit: boolean = false) => {
    if (isEdit) {
      setEditWorksheetFile(file);
      setEditAssignWorksheetName(file.name);
      setEditWorksheetUploadError(null);
    } else {
      setWorksheetFile(file);
      setAssignWorksheetName(file.name);
      setWorksheetUploadError(null);
    }

    const setProgress = isEdit ? setEditWorksheetProgress : setWorksheetUploadProgress;
    const setUploading = isEdit ? setEditWorksheetUploading : setWorksheetUploading;
    const setUrl = isEdit ? setEditAssignWorksheetUrl : setAssignWorksheetUrl;
    const setError = isEdit ? setEditWorksheetUploadError : setWorksheetUploadError;

    const gasUrl = (isEdit ? (editingAssignment?.gasWebAppUrl || assignGasUrl) : assignGasUrl)?.trim() ||
      localStorage.getItem('saved_gas_url')?.trim() || '';
    const currentCourse = courses.find((c) => c.id === (isEdit ? editingAssignment?.courseId : assignCourseId));

    if (gasUrl && gasUrl.startsWith('https://script.google.com/')) {
      setUploading(true);
      setProgress('กำลังอัพโหลดใบงานไปยัง Google Drive ผ่าน Google Apps Script...');
      try {
        const res = await uploadFileToGoogleDriveViaGAS(
          file,
          gasUrl,
          {
            studentId: 'INSTRUCTOR',
            studentName: 'Worksheet',
            assignmentCode: (isEdit ? editingAssignment?.code : 'WORKSHEET') || 'WORKSHEET',
            courseCode: currentCourse?.code || ''
          }
        );
        setUrl(res.fileUrl || res.webViewLink || '');
        setProgress('อัพโหลดเข้า Google Drive สำเร็จ');
      } catch (err: any) {
        console.warn('Worksheet GAS upload failed, checking fallback:', err);
        if (file.size <= 700 * 1024) {
          try {
            const dataUrl = await readFileAsDataUrl(file);
            setUrl(dataUrl);
            setProgress(`แนบเอกสารสำเร็จ (${formatFileSize(file.size)})`);
          } catch {
            setError('อัพโหลดไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาด'));
          }
        } else {
          setError(`อัพโหลดไปยัง Google Drive ไม่สำเร็จ (${err.message || 'ตรวจสอบสิทธิ์ Google Apps Script'}) หรือวางลิงก์ Google Drive ในแท็บระบุลิงก์`);
        }
      } finally {
        setUploading(false);
      }
    } else {
      // If no GAS URL configured
      if (file.size <= 700 * 1024) {
        setUploading(true);
        setProgress('กำลังประมวลผลไฟล์...');
        try {
          const dataUrl = await readFileAsDataUrl(file);
          setUrl(dataUrl);
          setProgress(`แนบเอกสารสำเร็จ (${formatFileSize(file.size)})`);
        } catch (err: any) {
          setError('เกิดข้อผิดพลาดในการประมวลผลไฟล์: ' + err.message);
        } finally {
          setUploading(false);
        }
      } else {
        setError(
          `ไฟล์มีขนาด ${formatFileSize(file.size)} (เกิน 700 KB) กรุณาระบุ Google Apps Script Web App URL ในแท็บ Google Drive (ฟรี) หรือระบุลิงก์ไฟล์ Google Drive โดยตรง`
        );
      }
    }
  };

  const handleRemoveWorksheet = (isEdit: boolean = false) => {
    if (isEdit) {
      setEditWorksheetFile(null);
      setEditAssignWorksheetName('');
      setEditAssignWorksheetUrl('');
      setEditWorksheetProgress(null);
      setEditWorksheetUploadError(null);
      if (editWorksheetFileInputRef.current) {
        editWorksheetFileInputRef.current.value = '';
      }
    } else {
      setWorksheetFile(null);
      setAssignWorksheetName('');
      setAssignWorksheetUrl('');
      setWorksheetUploadProgress(null);
      setWorksheetUploadError(null);
      if (worksheetFileInputRef.current) {
        worksheetFileInputRef.current.value = '';
      }
    }
  };

  const handleOpenEditAssignment = (assign: Assignment) => {
    setEditingAssignment(assign);
    setEditAssignTitle(assign.title);
    setEditAssignDesc(assign.description || '');
    setEditAssignCloseAt(new Date(assign.closeAt).toISOString().slice(0, 16));
    setEditAssignAllowLate(assign.allowLate);
    setEditAssignAllowResubmit(assign.allowResubmit);
    setEditAssignWorksheetName(assign.worksheetName || '');
    setEditAssignWorksheetUrl(assign.worksheetUrl || '');
    setEditWorksheetFile(null);
    setEditWorksheetProgress(assign.worksheetUrl ? 'เอกสารใบงานเดิมที่แนบไว้' : null);
    setEditWorksheetUploadError(null);
    setEditAssignError(null);
    setEditWorksheetSourceMode(assign.worksheetUrl && !assign.worksheetUrl.startsWith('data:') ? 'url' : 'upload');
  };

  const handleSaveEditAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssignment) return;
    if (!editAssignTitle.trim()) {
      setEditAssignError('กรุณาระบุชื่องาน');
      return;
    }
    if (editWorksheetUploading) {
      setEditAssignError('กรุณารอให้อัพโหลดไฟล์ใบงานเสร็จสิ้นก่อนบันทึก');
      return;
    }
    setIsUpdatingAssign(true);
    setEditAssignError(null);
    try {
      const updates: Partial<Assignment> = {
        title: editAssignTitle.trim(),
        description: editAssignDesc.trim(),
        closeAt: new Date(editAssignCloseAt).toISOString(),
        allowLate: editAssignAllowLate,
        allowResubmit: editAssignAllowResubmit,
        worksheetName: editAssignWorksheetName.trim(),
        worksheetUrl: editAssignWorksheetUrl.trim()
      };
      await updateAssignment(editingAssignment.id, updates);
      setAssignments((prev) =>
        prev.map((a) => (a.id === editingAssignment.id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a))
      );
      if (selectedAssignment?.id === editingAssignment.id) {
        setSelectedAssignment((prev) => (prev ? { ...prev, ...updates, updatedAt: new Date().toISOString() } : null));
      }
      setEditingAssignment(null);
    } catch (err: any) {
      console.error('Update assignment failed:', err);
      setEditAssignError('อัพเดตงานไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาด'));
    } finally {
      setIsUpdatingAssign(false);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const course = courses.find((c) => c.id === assignCourseId);
    if (!course) {
      alert('กรุณาเลือกรายวิชา');
      return;
    }

    if (!assignTitle.trim()) {
      alert('กรุณาระบุชื่องาน');
      return;
    }

    if (worksheetUploading) {
      alert('กรุณารอให้อัพโหลดไฟล์ใบงานเสร็จสิ้นก่อนสร้างงาน');
      return;
    }

    setAssignCreating(true);
    try {
      if (assignGasUrl) {
        localStorage.setItem('saved_gas_url', assignGasUrl.trim());
      }

      const created = await createAssignment({
        courseId: course.id,
        courseCode: course.code,
        courseTitle: course.title,
        sec: assignSec,
        title: assignTitle,
        description: assignDesc,
        acceptedTypes: assignAcceptedTypes,
        openAt: new Date(assignOpenAt).toISOString(),
        closeAt: new Date(assignCloseAt).toISOString(),
        allowLate: assignAllowLate,
        allowResubmit: assignAllowResubmit,
        maxFileSizeMB: assignMaxMB,
        worksheetUrl: assignWorksheetUrl,
        worksheetName: assignWorksheetName,
        gasWebAppUrl: assignGasUrl,
        instructorId: user.uid,
        instructorEmail: user.email || ''
      });

      setAssignments([created, ...assignments]);
      setActiveTab('assignments');
      setAssignTitle('');
      setAssignDesc('');
      setAssignWorksheetUrl('');
      setAssignWorksheetName('');
      setWorksheetFile(null);
      setWorksheetUploadProgress(null);
      setWorksheetUploadError(null);
      if (worksheetFileInputRef.current) {
        worksheetFileInputRef.current.value = '';
      }
    } catch (err: any) {
      alert('สร้างงานไม่สำเร็จ: ' + err.message);
    } finally {
      setAssignCreating(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCopyLink = (code: string) => {
    const origin = window.location.origin;
    const path = window.location.pathname;
    const url = `${origin}${path}?code=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(code);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleToggleStatus = async (assign: Assignment) => {
    const newStatus = assign.status === 'open' ? 'closed' : 'open';
    try {
      await toggleAssignmentStatus(assign.id, newStatus);
      setAssignments(
        assignments.map((a) => (a.id === assign.id ? { ...a, status: newStatus } : a))
      );
    } catch (err: any) {
      alert('อัพเดตสถานะไม่สำเร็จ: ' + err.message);
    }
  };

  const handleExtendDeadline = async () => {
    if (!extendModalAssignment || !extendDatetime) return;
    try {
      const iso = new Date(extendDatetime).toISOString();
      await extendAssignmentDeadline(extendModalAssignment.id, iso);
      setAssignments(
        assignments.map((a) => (a.id === extendModalAssignment.id ? { ...a, closeAt: iso } : a))
      );
      setExtendModalAssignment(null);
    } catch (err: any) {
      alert('ขยายเวลาไม่สำเร็จ: ' + err.message);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingAssignmentId || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteAssignment(deletingAssignmentId);
      setAssignments((prev) => prev.filter((a) => a.id !== deletingAssignmentId));
      if (selectedAssignment?.id === deletingAssignmentId) {
        setSelectedAssignment(null);
      }
      setDeletingAssignmentId(null);
    } catch (err: any) {
      console.error('Delete assignment failed:', err);
      setDeleteError('ลบงานไม่สำเร็จ: ' + (err?.message || 'เกิดข้อผิดพลาดในการลบข้อมูล'));
    } finally {
      setIsDeleting(false);
    }
  };


  const handleOverrideStatus = async (
    subId: string,
    newStatus: SubmissionStatus,
    feedback?: string,
    score?: number | null
  ) => {
    try {
      await overrideSubmissionStatus(subId, newStatus, feedback, score);
    } catch (err: any) {
      alert('อัพเดตสถานะไม่สำเร็จ: ' + err.message);
    }
  };

  const handleConfirmDeleteSubmission = async () => {
    if (!deletingSubmission) return;
    setIsDeletingSub(true);
    setDeleteSubError(null);
    try {
      await deleteSubmission(deletingSubmission.id);
      setSubmissions((prev) => prev.filter((s) => s.id !== deletingSubmission.id));
      setDeletingSubmission(null);
    } catch (err: any) {
      console.error('Delete submission error:', err);
      setDeleteSubError('ลบข้อมูลการส่งงานไม่สำเร็จ: ' + (err?.message || 'เกิดข้อผิดพลาด'));
    } finally {
      setIsDeletingSub(false);
    }
  };

  const handleExportCsv = () => {
    if (!selectedAssignment) return;
    const csvContent = exportSubmissionsToCsv(selectedAssignment, submissions, courseStudents);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${selectedAssignment.courseCode}_${selectedAssignment.code}_Submissions.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadSampleCsv = () => {
    const sampleContent = '\uFEFF' + `เลขที่,รหัสนักศึกษา,ชื่อ-นามสกุล,Sec,อีเมลสถาบัน\n1,1650700001,สมชาย ใจดี,Sec 1,somchai.j@bu.ac.th\n2,1650700002,สมหญิง รักเรียน,Sec 1,somying.r@bu.ac.th\n3,1650700003,กิตติพงษ์ มั่นคง,Sec 2,kittipong.m@bu.ac.th`;
    const blob = new Blob([sampleContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'sample_roster_classwork.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // If teacher is not logged in:
  if (!user) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 bg-transparent">
        <div className="max-w-md w-full bg-white/95 rounded-3xl border border-slate-200/80 p-8 sm:p-9 text-center shadow-pastel">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-pastel-sm">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
            เข้าสู่ระบบคุณครู/อาจารย์
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
            สำหรับการจัดการวิชา มอบหมายงาน ตรวจงาน และดาวน์โหลดรายงาน
          </p>

          <div className="my-6 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/70 text-left text-xs text-slate-600 space-y-1.5">
            <div className="font-semibold flex items-center gap-1.5 text-indigo-700">
              <ShieldAlert className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>การพิสูจน์ตัวตนอาจารย์ผู้สอน</span>
            </div>
            <p className="text-slate-500 leading-relaxed">
              ระบบอนุญาตให้เฉพาะอาจารย์ผู้สอน (<span className="font-medium text-indigo-600 font-mono">{AUTHORIZED_TEACHER_EMAIL}</span>) เข้าสู่ระบบเพื่อจัดการรายวิชาและตรวจงาน
            </p>
          </div>

          {loginError && (
            <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 text-left">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{loginError}</span>
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={authLoading || isSigningIn}
            className="w-full btn-pastel flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl font-medium text-sm text-white bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-pastel-sm hover:shadow-pastel cursor-pointer disabled:opacity-50"
          >
            {isSigningIn ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>กำลังเปิดหน้าต่างเข้าสู่ระบบ...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>เข้าสู่ระบบด้วย Google</span>
              </>
            )}
          </button>

          {onExitPortal && (
            <button
              onClick={onExitPortal}
              className="mt-5 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors inline-block"
            >
              ← กลับไปหน้าส่งงานนักศึกษา
            </button>
          )}
        </div>
      </div>
    );
  }

  // If user is logged in but NOT authorized:
  if (!isAuthorized) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 bg-transparent">
        <div className="max-w-md w-full bg-white/95 rounded-3xl border border-rose-200/90 p-8 sm:p-9 text-center shadow-pastel">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-100 text-rose-500 flex items-center justify-center mx-auto mb-4 shadow-pastel-sm">
            <ShieldAlert className="w-8 h-8 text-rose-500" />
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200/60 inline-block mb-2">
            ไม่มีสิทธิ์เข้าถึง (Access Denied)
          </span>

          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
            ไม่ได้รับสิทธิ์เข้าใช้งาน
          </h2>

          <div className="my-5 p-4 rounded-2xl bg-rose-50/50 border border-rose-100 text-left text-xs text-slate-700 space-y-2">
            <p className="leading-relaxed">
              ระบบอนุญาตให้เฉพาะอาจารย์ผู้สอนที่ได้รับสิทธิ์ ({AUTHORIZED_TEACHER_EMAIL}) เข้าใช้งานในส่วนนี้เท่านั้น บัญชีของคุณ (<span className="font-semibold text-rose-700 underline font-mono break-all">{user.email || 'ไม่ระบุอีเมล'}</span>) ไม่ได้รับอนุญาต
            </p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              * หากท่านเป็นนักศึกษาที่ต้องการส่งงาน กรุณากดปุ่มด้านล่างเพื่อกลับสู่หน้าส่งงาน
            </p>
          </div>

          <div className="space-y-2.5">
            <button
              onClick={() => logout()}
              className="w-full btn-pastel flex items-center justify-center gap-2 py-3 px-6 rounded-2xl font-medium text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-slate-500" />
              <span>ออกจากระบบ (Sign Out)</span>
            </button>

            {onExitPortal && (
              <button
                onClick={onExitPortal}
                className="w-full btn-pastel flex items-center justify-center gap-2 py-3 px-6 rounded-2xl font-medium text-sm text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-pastel-sm cursor-pointer"
              >
                <span>← กลับไปหน้าส่งงานนักศึกษา</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Filtered submissions
  const filteredSubmissions = submissions.filter((sub) => {
    if (statusFilter !== 'all' && sub.status !== statusFilter) return false;
    if (secFilter !== 'all' && sub.sec !== secFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        sub.studentId.toLowerCase().includes(q) ||
        sub.studentName.toLowerCase().includes(q) ||
        sub.receiptId.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalSubmissions = submissions.length;
  const onTimeCount = submissions.filter((s) => s.status === 'on_time').length;
  const lateCount = submissions.filter((s) => s.status === 'late').length;
  const leaveCount = submissions.filter((s) => s.status === 'personal_leave' || s.status === 'sick_leave').length;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-transparent pb-16">
      {/* Teacher Dashboard Sub-Header */}
      <div className="bg-white/80 border-b border-slate-200/70 sticky top-16 z-30 backdrop-blur-md shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 overflow-x-auto gap-4 no-scrollbar">
            <nav className="flex space-x-1 sm:space-x-2 shrink-0">
              <button
                onClick={() => setActiveTab('assignments')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'assignments'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <Layers className="w-4 h-4 text-indigo-500" />
                <span>งานที่มอบหมาย</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-100/80 text-[11px] text-indigo-700 font-bold">
                  {assignments.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('create_assignment')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'create_assignment'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <Plus className="w-4 h-4 text-indigo-500" />
                <span>สร้างงานใหม่</span>
              </button>

              <button
                onClick={() => setActiveTab('courses')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'courses'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <Users className="w-4 h-4 text-indigo-500" />
                <span>วิชา & รายชื่อนักศึกษา</span>
              </button>

              <button
                onClick={() => setActiveTab('submissions')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'submissions'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <FileCheck2 className="w-4 h-4 text-indigo-500" />
                <span>ตรวจงาน & สรุปผล</span>
                {selectedAssignment && (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-[11px] text-indigo-800 font-bold font-mono">
                    {selectedAssignment.code}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('gas_guide')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'gas_guide'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <HardDrive className="w-4 h-4 text-indigo-500" />
                <span>Google Drive (ฟรี)</span>
              </button>
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-medium text-slate-600 truncate max-w-[140px] hidden sm:inline">
                {user.email}
              </span>
              <button
                onClick={() => logout()}
                title="ออกจากระบบ"
                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-7">
        {/* ================= TAB 1: ASSIGNMENTS LIST ================= */}
        {activeTab === 'assignments' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                  งานที่มอบหมายทั้งหมด
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  แจกรหัส 6 หลักให้นักศึกษาส่งงานได้ทันที สะดวกและรวดเร็ว
                </p>
              </div>
              <button
                onClick={() => setActiveTab('create_assignment')}
                className="btn-pastel inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl font-medium text-xs sm:text-sm text-white bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-pastel-sm hover:shadow-pastel cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>สร้างงานใหม่</span>
              </button>
            </div>

            {assignmentsLoading ? (
              <div className="flex items-center justify-center p-12 text-indigo-500">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : assignments.length === 0 ? (
              <div className="bg-white/95 rounded-3xl border border-slate-200/80 p-12 text-center shadow-pastel-sm">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                  <FilePlus className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">ยังไม่มีงานที่มอบหมาย</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  กดปุ่มสร้างงานใหม่ด้านบนเพื่อสร้างงานและรับรหัส 6 หลักสำหรับแจกนักศึกษา
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {assignments.map((assign) => {
                  const isClosed = assign.status === 'closed';
                  const isExpired = new Date() > new Date(assign.closeAt);

                  return (
                    <div
                      key={assign.id}
                      className="bg-white/95 rounded-3xl border border-slate-200/80 shadow-pastel-sm hover:shadow-pastel transition-all flex flex-col justify-between overflow-hidden"
                    >
                      <div className="p-6">
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="font-semibold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                            {assign.courseCode} • {assign.sec === 'ALL' ? 'ทุกกลุ่ม' : assign.sec}
                          </span>
                          <span
                            className={`px-3 py-1 rounded-full font-medium text-[11px] ${
                              isClosed
                                ? 'bg-slate-100 text-slate-600 border border-slate-200/60'
                                : isExpired
                                ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                            }`}
                          >
                            {isClosed ? 'ปิดรับงาน' : isExpired ? 'เลยกำหนดส่ง' : 'เปิดรับงาน'}
                          </span>
                        </div>

                        <h3 className="font-bold text-slate-800 text-base leading-snug line-clamp-2 mt-2">
                          {assign.title}
                        </h3>

                        {/* Projector-Friendly High-Contrast Code Box */}
                        <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-indigo-50/70 via-purple-50/40 to-pink-50/30 border border-indigo-100 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">
                              รหัสส่งงาน 6 หลัก
                            </p>
                            <p className="font-mono text-2xl font-extrabold tracking-[0.2em] text-indigo-900 select-all">
                              {assign.code}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleCopyCode(assign.code)}
                              title="คัดลอกรหัส"
                              className="p-2.5 rounded-xl bg-white border border-slate-200/80 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition-colors shadow-2xs cursor-pointer"
                            >
                              {copiedCode === assign.code ? (
                                <Check className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleCopyLink(assign.code)}
                              title="คัดลอกลิงก์ส่งงาน"
                              className="p-2.5 rounded-xl bg-white border border-slate-200/80 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition-colors shadow-2xs cursor-pointer"
                            >
                              {copiedLink === assign.code ? (
                                <Check className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Share2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 space-y-1 text-xs text-slate-500">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>ปิดรับ: {new Date(assign.closeAt).toLocaleString('th-TH')}</span>
                          </div>
                        </div>

                        {assign.worksheetUrl && (
                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 min-w-0 text-slate-600">
                              <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span className="truncate max-w-[150px] font-medium" title={assign.worksheetName || 'ใบงาน'}>
                                {assign.worksheetName || 'เอกสารใบงาน'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewItem({
                                  url: assign.worksheetUrl!,
                                  fileName: assign.worksheetName || 'ใบงาน',
                                  type: 'file',
                                  studentName: 'อาจารย์ผู้สอน',
                                  studentId: assign.courseCode
                                });
                                setIframeLoading(true);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>เปิดดูใบงาน</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="px-6 py-3.5 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between gap-2">
                        <button
                          onClick={() => {
                            setSelectedAssignment(assign);
                            setActiveTab('submissions');
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold text-indigo-700 bg-white border border-indigo-200/80 hover:bg-indigo-50 transition-all shadow-2xs cursor-pointer"
                        >
                          <FileCheck2 className="w-3.5 h-3.5 text-indigo-600" />
                          <span>ดูงานที่ส่ง</span>
                        </button>

                        <button
                          onClick={() => handleOpenEditAssignment(assign)}
                          title="แก้ไขงานและใบงาน"
                          className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-indigo-600 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleToggleStatus(assign)}
                          title={isClosed ? 'เปิดรับงาน' : 'ปิดรับงาน'}
                          className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                        >
                          {isClosed ? <Unlock className="w-4 h-4 text-emerald-600" /> : <Lock className="w-4 h-4 text-amber-600" />}
                        </button>

                        <button
                          onClick={() => {
                            setExtendModalAssignment(assign);
                            setExtendDatetime(new Date(assign.closeAt).toISOString().slice(0, 16));
                          }}
                          title="ขยายเวลาส่ง"
                          className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                        >
                          <Clock className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            setDeleteError(null);
                            setDeletingAssignmentId(assign.id);
                          }}
                          title="ลบงาน"
                          className="p-2 rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shadow-2xs cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: CREATE ASSIGNMENT ================= */}
        {activeTab === 'create_assignment' && (
          <div className="max-w-2xl mx-auto bg-white/95 rounded-3xl border border-slate-200/80 p-7 sm:p-9 shadow-pastel">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
                สร้างงานที่มอบหมาย
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                ระบบจะสร้างรหัส 6 หลักอัตโนมัติ ให้นักศึกษานำไปส่งงานได้ทันที
              </p>
            </div>

            <form onSubmit={handleCreateAssignment} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    เลือกรายวิชา *
                  </label>
                  <select
                    value={assignCourseId}
                    onChange={(e) => setAssignCourseId(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-hidden transition-all"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    กลุ่มเรียน (Section)
                  </label>
                  <select
                    value={assignSec}
                    onChange={(e) => setAssignSec(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-hidden transition-all"
                  >
                    <option value="ALL">เปิดรับทุกกลุ่ม (All Sections)</option>
                    {courses
                      .find((c) => c.id === assignCourseId)
                      ?.sections.map((sec) => (
                        <option key={sec} value={sec}>
                          เฉพาะกลุ่ม {sec}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ชื่องานที่มอบหมาย *
                </label>
                <input
                  type="text"
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  placeholder="เช่น ใบงานที่ 3: ออกแบบ Responsive Mobile UI"
                  required
                  className="w-full px-4 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-hidden transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  คำอธิบายหรือคำแนะนำในการทำ (Description)
                </label>
                <textarea
                  rows={3}
                  value={assignDesc}
                  onChange={(e) => setAssignDesc(e.target.value)}
                  placeholder="รายละเอียด ข้อกำหนด และเงื่อนไขการส่งงาน..."
                  className="w-full px-4 py-2.5 bg-slate-50/70 border border-slate-200 rounded-2xl text-sm text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-hidden transition-all leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    วัน-เวลาเปิดรับงาน
                  </label>
                  <input
                    type="datetime-local"
                    value={assignOpenAt}
                    onChange={(e) => setAssignOpenAt(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-hidden transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    วัน-เวลาปิดรับงาน (กำหนดส่ง)
                  </label>
                  <input
                    type="datetime-local"
                    value={assignCloseAt}
                    onChange={(e) => setAssignCloseAt(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-hidden transition-all"
                  />
                </div>
              </div>

              {/* Options */}
              <div className="p-5 rounded-2xl bg-indigo-50/40 border border-indigo-100/70 space-y-3">
                <span className="block text-xs font-bold text-slate-700">เงื่อนไขการส่งงาน</span>
                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignAllowLate}
                      onChange={(e) => setAssignAllowLate(e.target.checked)}
                      className="rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-400"
                    />
                    <span>อนุญาตให้ส่งช้าได้ (ระบบจะทำเครื่องหมาย "ส่งช้า")</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignAllowResubmit}
                      onChange={(e) => setAssignAllowResubmit(e.target.checked)}
                      className="rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-400"
                    />
                    <span>อนุญาตให้ส่งซ้ำก่อนปิดรับได้ (ใช้ไฟล์ล่าสุด)</span>
                  </label>
                </div>
              </div>

              {/* Worksheet attachment */}
              <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-indigo-500" />
                      <span>แนบใบงาน (Worksheet) ให้นักศึกษาดาวน์โหลด</span>
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      อัพโหลดไฟล์ PDF, Word (.docx), รูปภาพ หรือระบุลิงก์ Google Drive
                    </p>
                  </div>

                  {/* Mode toggle */}
                  <div className="inline-flex p-1 bg-slate-200/70 rounded-xl text-xs font-medium self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setWorksheetSourceMode('upload')}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        worksheetSourceMode === 'upload'
                          ? 'bg-white text-indigo-600 font-bold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      อัพโหลดไฟล์
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorksheetSourceMode('url')}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        worksheetSourceMode === 'url'
                          ? 'bg-white text-indigo-600 font-bold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ระบุลิงก์ภายนอก
                    </button>
                  </div>
                </div>

                {worksheetSourceMode === 'upload' ? (
                  <div className="space-y-3">
                    {/* If file is selected or already uploaded */}
                    {(worksheetFile || assignWorksheetUrl) ? (
                      <div className="p-4 rounded-2xl bg-white border border-indigo-100 shadow-2xs flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                            {getWorksheetIcon(assignWorksheetName || worksheetFile?.name || '')}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-xs text-slate-800 truncate">
                              {assignWorksheetName || worksheetFile?.name || 'เอกสารใบงาน'}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                              {worksheetFile && <span>{formatFileSize(worksheetFile.size)}</span>}
                              {worksheetUploading ? (
                                <span className="flex items-center gap-1 text-indigo-600 font-medium">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>{worksheetUploadProgress || 'กำลังอัพโหลด...'}</span>
                                </span>
                              ) : assignWorksheetUrl ? (
                                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                                  <CheckCircle className="w-3 h-3" />
                                  <span>{worksheetUploadProgress || 'พร้อมดาวน์โหลด'}</span>
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {assignWorksheetUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewItem({
                                  url: assignWorksheetUrl,
                                  fileName: assignWorksheetName || 'ใบงาน',
                                  type: 'file',
                                  studentName: 'อาจารย์ผู้สอน',
                                  studentId: 'INSTRUCTOR'
                                });
                                setIframeLoading(true);
                              }}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="ดูตัวอย่างไฟล์"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveWorksheet(false)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="ลบไฟล์"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Drag & Drop Zone */
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDraggingWorksheet(true);
                        }}
                        onDragLeave={() => setIsDraggingWorksheet(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDraggingWorksheet(false);
                          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                            handleWorksheetFileSelect(e.dataTransfer.files[0], false);
                          }
                        }}
                        onClick={() => worksheetFileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                          isDraggingWorksheet
                            ? 'border-indigo-500 bg-indigo-50/80 scale-[1.01]'
                            : 'border-slate-300 hover:border-indigo-400 bg-white hover:bg-indigo-50/20'
                        }`}
                      >
                        <input
                          ref={worksheetFileInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleWorksheetFileSelect(e.target.files[0], false);
                            }
                          }}
                          className="hidden"
                        />
                        <div className="flex flex-col items-center justify-center gap-1.5 pointer-events-none">
                          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mb-1">
                            <Upload className="w-5 h-5" />
                          </div>
                          <p className="text-xs font-semibold text-slate-700">
                            ลากไฟล์มาวางที่นี่ หรือ <span className="text-indigo-600 underline">คลิกเพื่อเลือกไฟล์</span>
                          </p>
                          <p className="text-[11px] text-slate-400">
                            รองรับ PDF, Word (.docx), PNG, JPG (อัพโหลดเข้า Google Drive อัตโนมัติหากตั้งค่าไว้)
                          </p>
                        </div>
                      </div>
                    )}

                    {worksheetUploadError && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                        <div className="flex-1">
                          <span>{worksheetUploadError}</span>
                          <div className="mt-1">
                            <button
                              type="button"
                              onClick={() => setWorksheetSourceMode('url')}
                              className="text-[11px] font-semibold underline text-indigo-600 hover:text-indigo-800 cursor-pointer"
                            >
                              สลับไปใช้การระบุลิงก์ Google Drive โดยตรง &rarr;
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* URL Mode */
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">ชื่อเอกสารใบงาน</label>
                        <input
                          type="text"
                          value={assignWorksheetName}
                          onChange={(e) => setAssignWorksheetName(e.target.value)}
                          placeholder="เช่น ใบงานที่ 3 - Wireframe.pdf"
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:border-indigo-400 outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">ลิงก์ใบงาน (Google Drive / Canva)</label>
                        <input
                          type="url"
                          value={assignWorksheetUrl}
                          onChange={(e) => setAssignWorksheetUrl(e.target.value)}
                          placeholder="https://drive.google.com/..."
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:border-indigo-400 outline-hidden"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      💡 แนะนำ: ตั้งค่าการแชร์ใน Google Drive ให้เป็น "ทุกคนที่มีลิงก์สามารถดูได้" เพื่อให้นักศึกษาเข้าถึงได้สะดวก
                    </p>
                  </div>
                )}
              </div>

              {/* Google Apps Script Integration */}
              <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <HardDrive className="w-4 h-4 text-indigo-500" />
                      <span>Google Apps Script Web App URL (บันทึกไฟล์งานลง Google Drive)</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      ระบุ Web App URL เพื่ออัพโหลดและจัดเก็บไฟล์งานของนักศึกษาใน Google Drive ฟรี 100%
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('gas_guide')}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline self-start sm:self-auto cursor-pointer"
                  >
                    วิธีตั้งค่า Google Apps Script &rarr;
                  </button>
                </div>

                <input
                  type="url"
                  value={assignGasUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAssignGasUrl(val);
                    if (val.trim()) {
                      localStorage.setItem('saved_gas_url', val.trim());
                    }
                  }}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-hidden transition-all"
                />

                {!assignGasUrl.trim() ? (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                    <div>
                      <p className="font-semibold">⚠️ หากไม่ระบุ Google Apps Script URL ระบบจะบันทึกได้เพียงชื่อไฟล์ของนักศึกษา แต่จะไม่สามารถเปิดพรีวิวหรือดาวน์โหลดไฟล์งานจริงใน Google Drive ได้</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-emerald-600 flex items-center gap-1 font-medium">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>บันทึก Web App URL นี้ไว้ในเครื่องแล้ว (จะนำมาเติมให้อัตโนมัติเมื่อสร้างงานครั้งถัดไป)</span>
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={assignCreating || courses.length === 0}
                className="w-full btn-pastel flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl font-medium text-sm text-white bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-pastel-sm hover:shadow-pastel disabled:opacity-40 cursor-pointer"
              >
                {assignCreating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>กำลังสร้างงานและออกรหัส 6 หลัก...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>สร้างงานและรับรหัส 6 หลัก</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ================= TAB 3: COURSES & ROSTER ================= */}
        {activeTab === 'courses' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                  จัดการรายวิชาและรายชื่อนักศึกษา
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  นำเข้ารายชื่อผ่าน CSV (รองรับภาษาไทย UTF-8) เพื่อให้นักศึกษายืนยันตัวตน
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={downloadSampleCsv}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5 text-slate-500" />
                  <span>ตัวอย่าง CSV</span>
                </button>
                <button
                  onClick={() => setShowNewCourseModal(true)}
                  className="btn-pastel inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-pastel-sm hover:shadow-pastel cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>เพิ่มรายวิชา</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {courses.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedCourseId(c.id);
                    loadStudents(c.id);
                  }}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer relative group ${
                    selectedCourseId === c.id
                      ? 'bg-indigo-50/60 border-indigo-400 shadow-pastel-sm'
                      : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-indigo-700 text-sm font-mono">{c.code}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full">
                        {c.sections.length} กลุ่ม
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setUpdateCourseError(null);
                          setEditingCourse(c);
                          setEditCourseCode(c.code);
                          setEditCourseTitle(c.title);
                          setEditCourseSecs(c.sections.join(', '));
                        }}
                        title="แก้ไขรายวิชา"
                        className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteCourseError(null);
                          setDeletingCourseId(c.id);
                        }}
                        title="ลบรายวิชา"
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-bold text-slate-800 text-sm line-clamp-1">{c.title}</h3>
                </div>
              ))}
            </div>

            {selectedCourseId && (
              <div className="bg-white/95 rounded-3xl border border-slate-200/80 p-6 sm:p-7 shadow-pastel-sm space-y-6">
                {/* Hidden File Input */}
                <input
                  ref={csvFileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setCsvFile(e.target.files[0]);
                      setCsvResultMsg(null);
                    }
                  }}
                  className="hidden"
                />

                {/* CSV Upload Zone: Clean Drag-and-Drop or Selected File Card */}
                {!csvFile ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingCsv(true);
                    }}
                    onDragLeave={() => setIsDraggingCsv(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingCsv(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        const file = e.dataTransfer.files[0];
                        if (file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv')) {
                          setCsvFile(file);
                          setCsvResultMsg(null);
                        } else {
                          setCsvResultMsg({
                            success: false,
                            message: 'กรุณาเลือกไฟล์นามสกุล .csv เท่านั้น',
                          });
                        }
                      }
                    }}
                    onClick={() => csvFileInputRef.current?.click()}
                    className={`p-6 sm:p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
                      isDraggingCsv
                        ? 'border-indigo-400 bg-indigo-50/70 shadow-pastel-sm scale-[1.01]'
                        : 'border-slate-200/90 bg-slate-50/50 hover:bg-slate-50 hover:border-indigo-300'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mb-3 shadow-2xs">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-800">
                      ลากและวางไฟล์ CSV ที่นี่ หรือคลิกเพื่อเลือกไฟล์
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-md">
                      รองรับไฟล์รายชื่อนักศึกษา .csv (UTF-8) ที่มีคอลัมน์: เลขที่, รหัสนักศึกษา, ชื่อ-นามสกุล, Sec, อีเมลสถาบัน
                    </p>

                    <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                      <span className="btn-pastel inline-flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 shadow-2xs">
                        <Upload className="w-3.5 h-3.5" />
                        <span>เลือกไฟล์ CSV</span>
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadSampleCsv();
                        }}
                        className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 shadow-2xs transition-colors cursor-pointer"
                      >
                        <FileDown className="w-3.5 h-3.5 text-slate-400" />
                        <span>ดาวน์โหลดไฟล์ตัวอย่าง</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
                        <FileSpreadsheet className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-xs sm:text-sm truncate">
                            {csvFile.name}
                          </span>
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full shrink-0">
                            {(csvFile.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          พร้อมนำเข้ารายชื่อเข้าสู่รายวิชา: {courses.find((c) => c.id === selectedCourseId)?.code}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setCsvFile(null);
                          if (csvFileInputRef.current) csvFileInputRef.current.value = '';
                        }}
                        disabled={csvImporting}
                        title="ยกเลิกไฟล์นี้"
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={handleImportRoster}
                        disabled={csvImporting}
                        className="btn-pastel inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 shadow-pastel-sm hover:shadow-pastel transition-all cursor-pointer disabled:opacity-50"
                      >
                        {csvImporting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>กำลังนำเข้ารายชื่อ...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span>อัปโหลดรายชื่อนักศึกษา</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {csvResultMsg && (
                  <div
                    className={`p-4 rounded-2xl text-xs flex items-start gap-2.5 ${
                      csvResultMsg.success
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border border-rose-200 text-rose-800'
                    }`}
                  >
                    {csvResultMsg.success ? <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
                    <span>{csvResultMsg.message}</span>
                  </div>
                )}

                <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                      <tr>
                        <th className="px-4 py-3">เลขที่</th>
                        <th className="px-4 py-3">รหัสนักศึกษา</th>
                        <th className="px-4 py-3">ชื่อ-นามสกุล</th>
                        <th className="px-4 py-3">กลุ่ม (Sec)</th>
                        <th className="px-4 py-3">อีเมลสถาบัน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {courseStudents.map((st) => (
                        <tr key={st.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 text-slate-500 font-mono">{st.studentNo}</td>
                          <td className="px-4 py-3 font-mono font-bold text-slate-800">{st.studentId}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{st.fullName}</td>
                          <td className="px-4 py-3 text-indigo-700 font-medium">{st.sec}</td>
                          <td className="px-4 py-3 text-slate-500">{st.email || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: SUBMISSIONS & REALTIME GRADING ================= */}
        {activeTab === 'submissions' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                  ตรวจงาน & สรุปผล
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  อัพเดตแบบ Real-time ทันทีที่นักศึกษาส่งงาน พร้อมส่งออกรายงาน CSV
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedAssignment?.id || ''}
                  onChange={(e) => {
                    const found = assignments.find((a) => a.id === e.target.value);
                    setSelectedAssignment(found || null);
                  }}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:border-indigo-400 shadow-2xs outline-hidden"
                >
                  <option value="">-- เลือกงานที่ต้องการตรวจ --</option>
                  {assignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.courseCode}: {a.title} ({a.sec === 'ALL' ? 'ทุกกลุ่ม' : a.sec})
                    </option>
                  ))}
                </select>

                {selectedAssignment && (
                  <button
                    onClick={handleExportCsv}
                    className="btn-pastel inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 shadow-2xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>ส่งออก CSV</span>
                  </button>
                )}
              </div>
            </div>

            {selectedAssignment && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">ส่งงานแล้วทั้งหมด</span>
                    <p className="text-2xl font-mono font-bold text-slate-800 mt-1">{totalSubmissions} คน</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">ส่งตรงเวลา</span>
                    <p className="text-2xl font-mono font-bold text-emerald-600 mt-1">{onTimeCount} คน</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">ส่งช้า (LATE)</span>
                    <p className="text-2xl font-mono font-bold text-amber-600 mt-1">{lateCount} คน</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">ลากิจ / ลาป่วย</span>
                    <p className="text-2xl font-mono font-bold text-indigo-600 mt-1">{leaveCount} คน</p>
                  </div>
                </div>

                <div className="bg-white/95 rounded-3xl border border-slate-200/80 p-6 space-y-4 shadow-pastel-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="relative w-full max-w-md">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="ค้นหารหัสนักศึกษา, ชื่อ หรือ Receipt ID..."
                        className="w-full pl-10 pr-4 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-400 outline-hidden transition-all"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                        <tr>
                          <th className="px-4 py-3">เลขที่</th>
                          <th className="px-4 py-3">รหัส</th>
                          <th className="px-4 py-3">ชื่อ-นามสกุล</th>
                          <th className="px-4 py-3">กลุ่ม</th>
                          <th className="px-4 py-3">เวลาที่ส่ง</th>
                          <th className="px-4 py-3">สถานะ</th>
                          <th className="px-4 py-3">ไฟล์ / ลิงก์</th>
                          <th className="px-4 py-3">หมายเลขอ้างอิง</th>
                          <th className="px-4 py-3">คะแนน</th>
                          <th className="px-4 py-3 text-center">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredSubmissions.map((sub) => (
                          <tr key={sub.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-4 py-3.5 font-mono text-slate-500">{sub.studentNo}</td>
                            <td className="px-4 py-3.5 font-mono font-bold text-slate-800">{sub.studentId}</td>
                            <td className="px-4 py-3.5 font-medium text-slate-800">{sub.studentName}</td>
                            <td className="px-4 py-3.5 text-indigo-700 font-medium">{sub.sec}</td>
                            <td className="px-4 py-3.5 font-mono text-slate-500">
                              {new Date(sub.submittedAt).toLocaleTimeString('th-TH')}
                            </td>
                            <td className="px-4 py-3.5">
                              <select
                                value={sub.status}
                                onChange={(e) =>
                                  handleOverrideStatus(sub.id, e.target.value as SubmissionStatus)
                                }
                                className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-700 cursor-pointer outline-hidden"
                              >
                                <option value="on_time">ส่งตรงเวลา</option>
                                <option value="late">ส่งช้า</option>
                                <option value="missing">ไม่ส่ง</option>
                                <option value="personal_leave">ลากิจ</option>
                                <option value="sick_leave">ลาป่วย</option>
                              </select>
                            </td>
                            <td className="px-4 py-3.5 text-[11px]">
                              {sub.fileUrl ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewItem({
                                      url: sub.fileUrl!,
                                      fileName: sub.fileName || 'ไฟล์งานที่ส่ง',
                                      type: 'file',
                                      studentName: sub.studentName,
                                      studentId: sub.studentId
                                    });
                                    setIframeLoading(true);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200/60 font-medium transition-all cursor-pointer group text-left max-w-[170px]"
                                  title="คลิกเพื่อดูตัวอย่างไฟล์ (Preview)"
                                >
                                  <Eye className="w-3.5 h-3.5 shrink-0 text-indigo-500 group-hover:text-indigo-700" />
                                  <span className="truncate">{sub.fileName || 'เปิดไฟล์'}</span>
                                </button>
                              ) : sub.workLink ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewItem({
                                      url: sub.workLink!,
                                      fileName: 'ลิงก์ผลงาน',
                                      type: 'link',
                                      studentName: sub.studentName,
                                      studentId: sub.studentId
                                    });
                                    setIframeLoading(true);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200/60 font-medium transition-all cursor-pointer group text-left"
                                  title="คลิกเพื่อดูตัวอย่างลิงก์ (Preview)"
                                >
                                  <Eye className="w-3.5 h-3.5 shrink-0 text-indigo-500 group-hover:text-indigo-700" />
                                  <span>เปิดลิงก์</span>
                                </button>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-4 py-3.5 font-mono text-indigo-600 text-[11px]">
                              {sub.receiptId}
                            </td>
                            <td className="px-4 py-3.5">
                              <input
                                type="number"
                                defaultValue={sub.score ?? ''}
                                onBlur={(e) => {
                                  const val = e.target.value === '' ? null : Number(e.target.value);
                                  handleOverrideStatus(sub.id, sub.status, sub.feedback, val);
                                }}
                                className="w-16 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:bg-white focus:border-indigo-400 outline-hidden"
                              />
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setDeletingSubmission(sub);
                                  setDeleteSubError(null);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer inline-flex items-center justify-center"
                                title="ลบข้อมูลการส่งงาน"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 5: GAS GUIDE ================= */}
        {activeTab === 'gas_guide' && (
          <div className="max-w-3xl mx-auto bg-white/95 rounded-3xl border border-slate-200/80 p-7 sm:p-9 space-y-6 shadow-pastel">
            <div>
              <div className="inline-flex p-3 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 mb-3 shadow-2xs">
                <HardDrive className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
                วิธีเก็บไฟล์งานใน Google Drive ด้วย Google Apps Script
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                ฟรี 100% ภายใต้ Firebase Spark Plan โดยไม่ต้องอัปเกรดเป็น Blaze Plan
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-3 text-xs text-slate-700">
                <span className="font-bold text-sm text-slate-800 block">ขั้นตอนการติดตั้ง (ใช้เวลา 2 นาที):</span>
                <ol className="list-decimal list-inside space-y-2 leading-relaxed">
                  <li>ไปที่ <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-semibold">script.google.com</a> แล้วกดปุ่ม "New project"</li>
                  <li>ลบโค้ดเดิมทั้งหมด แล้วคัดลอกโค้ดด้านล่างนี้ไปวาง</li>
                  <li>กด Deploy &rarr; New deployment &rarr; เลือกประเภท Web app</li>
                  <li>ตั้งค่า: Execute as "Me", Who has access: "Anyone"</li>
                  <li>กด Deploy และให้สิทธิ์เข้าถึง นำ URL มากรอกในระบบได้เลย!</li>
                </ol>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700">โค้ด Google Apps Script:</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(GAS_TEMPLATE_CODE);
                      setCopiedGasCode(true);
                      setTimeout(() => setCopiedGasCode(false), 2000);
                    }}
                    className="btn-pastel inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-pastel-sm cursor-pointer"
                  >
                    {copiedGasCode ? <Check className="w-3.5 h-3.5 text-emerald-200" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedGasCode ? 'คัดลอกโค้ดแล้ว!' : 'คัดลอกโค้ด'}</span>
                  </button>
                </div>
                <pre className="p-5 rounded-2xl bg-slate-900 text-indigo-200 font-mono text-[11px] overflow-x-auto max-h-80 border border-slate-800 leading-relaxed">
                  {GAS_TEMPLATE_CODE}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: New Course */}
      {showNewCourseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-pastel space-y-4">
            <h3 className="text-lg font-bold text-slate-800">เพิ่มรายวิชาใหม่</h3>
            <form onSubmit={handleCreateCourse} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">รหัสวิชา</label>
                <input
                  type="text"
                  required
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value.toUpperCase())}
                  placeholder="เช่น CS101"
                  className="w-full px-4 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 uppercase focus:bg-white focus:border-indigo-400 outline-hidden font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ชื่อวิชา</label>
                <input
                  type="text"
                  required
                  value={newCourseTitle}
                  onChange={(e) => setNewCourseTitle(e.target.value)}
                  placeholder="เช่น การพัฒนาเว็บแอปพลิเคชัน"
                  className="w-full px-4 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-400 outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">กลุ่มเรียน (คั่นด้วยจุลภาค)</label>
                <input
                  type="text"
                  value={newCourseSecs}
                  onChange={(e) => setNewCourseSecs(e.target.value)}
                  placeholder="Sec 1, Sec 2"
                  className="w-full px-4 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-400 outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewCourseModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="btn-pastel px-5 py-2 text-xs font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl shadow-pastel-sm cursor-pointer"
                >
                  บันทึกรายวิชา
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Course */}
      {editingCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-pastel space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-600" />
                <span>แก้ไขข้อมูลรายวิชา</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingCourse(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {updateCourseError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{updateCourseError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateCourse} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  รหัสวิชา (Course Code) *
                </label>
                <input
                  type="text"
                  required
                  value={editCourseCode}
                  onChange={(e) => setEditCourseCode(e.target.value.toUpperCase())}
                  placeholder="เช่น CS101 หรือ CA4"
                  className="w-full px-4 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 uppercase focus:bg-white focus:border-indigo-400 outline-hidden font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ชื่อวิชา (Course Title) *
                </label>
                <input
                  type="text"
                  required
                  value={editCourseTitle}
                  onChange={(e) => setEditCourseTitle(e.target.value)}
                  placeholder="เช่น การพัฒนาเว็บแอปพลิเคชัน"
                  className="w-full px-4 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-400 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  กลุ่มเรียน (คั่นด้วยจุลภาค)
                </label>
                <input
                  type="text"
                  value={editCourseSecs}
                  onChange={(e) => setEditCourseSecs(e.target.value)}
                  placeholder="Sec 1, Sec 2, 206A"
                  className="w-full px-4 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-400 outline-hidden"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  ตัวอย่าง: 206A, Sec 1, Sec 2
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  disabled={isUpdatingCourse}
                  onClick={() => setEditingCourse(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingCourse}
                  className="btn-pastel flex items-center justify-center gap-1.5 px-5 py-2 text-xs font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl shadow-pastel-sm cursor-pointer disabled:opacity-50"
                >
                  {isUpdatingCourse ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <span>บันทึกการแก้ไข</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Course Confirmation */}
      {deletingCourseId && (() => {
        const targetCourse = courses.find((c) => c.id === deletingCourseId);

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white border border-rose-100 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-pastel space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-500 flex items-center justify-center shrink-0 shadow-2xs">
                  <Trash2 className="w-6 h-6 text-rose-500" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-slate-800">
                    ยืนยันการลบรายวิชา
                  </h3>
                  {targetCourse && (
                    <p className="text-xs font-medium text-slate-500 truncate max-w-[260px]">
                      {targetCourse.code} • {targetCourse.title}
                    </p>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-100/80 text-xs text-rose-800 leading-relaxed space-y-1">
                <p className="font-semibold text-rose-900">
                  คุณแน่ใจหรือไม่ว่าต้องการลบรายวิชานี้?
                </p>
                <p className="text-slate-600 text-[11.5px]">
                  การลบรายวิชาจะลบข้อมูลรายชื่อนักศึกษาทั้งหมดในวิชานี้ออกจากระบบอย่างถาวรและไม่สามารถกู้คืนได้
                </p>
              </div>

              {deleteCourseError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span className="break-all">{deleteCourseError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isDeletingCourse}
                  onClick={() => {
                    setDeletingCourseId(null);
                    setDeleteCourseError(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={isDeletingCourse}
                  onClick={handleConfirmDeleteCourse}
                  className="btn-pastel flex items-center justify-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-pastel-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isDeletingCourse ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังลบรายวิชา...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>ยืนยันลบรายวิชา</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Extend Deadline */}
      {extendModalAssignment && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-6 shadow-pastel space-y-4">
            <h3 className="text-lg font-bold text-slate-800">ขยายเวลาส่งงาน</h3>
            <p className="text-xs text-slate-500">
              {extendModalAssignment.courseCode}: {extendModalAssignment.title}
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">กำหนดส่งใหม่</label>
              <input
                type="datetime-local"
                value={extendDatetime}
                onChange={(e) => setExtendDatetime(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-400 outline-hidden"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setExtendModalAssignment(null)}
                className="px-4 py-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleExtendDeadline}
                className="btn-pastel px-5 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl shadow-pastel-sm cursor-pointer"
              >
                บันทึกการขยายเวลา
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Assignment */}
      {editingAssignment && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-pastel space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    แก้ไขงานที่มอบหมาย
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {editingAssignment.courseCode} • รหัสงาน: {editingAssignment.code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingAssignment(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editAssignError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{editAssignError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditAssignment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ชื่องานที่มอบหมาย *
                </label>
                <input
                  type="text"
                  required
                  value={editAssignTitle}
                  onChange={(e) => setEditAssignTitle(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-400 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  คำอธิบายหรือคำแนะนำ
                </label>
                <textarea
                  rows={2}
                  value={editAssignDesc}
                  onChange={(e) => setEditAssignDesc(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-400 outline-hidden leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  กำหนดส่ง (วัน-เวลาปิดรับงาน) *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={editAssignCloseAt}
                  onChange={(e) => setEditAssignCloseAt(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-400 outline-hidden"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-indigo-50/40 border border-indigo-100 flex flex-wrap gap-4 text-xs font-medium text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editAssignAllowLate}
                    onChange={(e) => setEditAssignAllowLate(e.target.checked)}
                    className="rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-400"
                  />
                  <span>อนุญาตให้ส่งช้าได้</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editAssignAllowResubmit}
                    onChange={(e) => setEditAssignAllowResubmit(e.target.checked)}
                    className="rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-400"
                  />
                  <span>อนุญาตให้ส่งซ้ำได้</span>
                </label>
              </div>

              {/* Edit Worksheet Section */}
              <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-500" />
                    <span>ใบงานประกอบ (Worksheet)</span>
                  </span>
                  <div className="inline-flex p-0.5 bg-slate-200/70 rounded-lg text-[11px] font-medium">
                    <button
                      type="button"
                      onClick={() => setEditWorksheetSourceMode('upload')}
                      className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                        editWorksheetSourceMode === 'upload'
                          ? 'bg-white text-indigo-600 font-bold shadow-2xs'
                          : 'text-slate-600'
                      }`}
                    >
                      อัพโหลดไฟล์
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditWorksheetSourceMode('url')}
                      className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                        editWorksheetSourceMode === 'url'
                          ? 'bg-white text-indigo-600 font-bold shadow-2xs'
                          : 'text-slate-600'
                      }`}
                    >
                      ลิงก์ภายนอก
                    </button>
                  </div>
                </div>

                {editWorksheetSourceMode === 'upload' ? (
                  <div className="space-y-2.5">
                    {(editWorksheetFile || editAssignWorksheetUrl) ? (
                      <div className="p-3 rounded-xl bg-white border border-indigo-100 flex items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                            {getWorksheetIcon(editAssignWorksheetName || editWorksheetFile?.name || '')}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-xs text-slate-800 truncate">
                              {editAssignWorksheetName || editWorksheetFile?.name || 'ใบงาน'}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {editWorksheetUploading ? (
                                <span className="text-indigo-600 flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>{editWorksheetProgress || 'กำลังอัพโหลด...'}</span>
                                </span>
                              ) : editAssignWorksheetUrl ? (
                                <span className="text-emerald-600 flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  <span>พร้อมดาวน์โหลด</span>
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {editAssignWorksheetUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewItem({
                                  url: editAssignWorksheetUrl,
                                  fileName: editAssignWorksheetName || 'ใบงาน',
                                  type: 'file',
                                  studentName: 'อาจารย์ผู้สอน',
                                  studentId: editingAssignment.courseCode
                                });
                                setIframeLoading(true);
                              }}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                              title="ดูตัวอย่าง"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveWorksheet(true)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="ลบไฟล์"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDraggingEditWorksheet(true);
                        }}
                        onDragLeave={() => setIsDraggingEditWorksheet(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDraggingEditWorksheet(false);
                          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                            handleWorksheetFileSelect(e.dataTransfer.files[0], true);
                          }
                        }}
                        onClick={() => editWorksheetFileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                          isDraggingEditWorksheet
                            ? 'border-indigo-500 bg-indigo-50/80'
                            : 'border-slate-300 hover:border-indigo-400 bg-white'
                        }`}
                      >
                        <input
                          ref={editWorksheetFileInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleWorksheetFileSelect(e.target.files[0], true);
                            }
                          }}
                          className="hidden"
                        />
                        <div className="flex flex-col items-center justify-center gap-1 pointer-events-none">
                          <Upload className="w-5 h-5 text-indigo-500" />
                          <p className="text-xs font-semibold text-slate-700">
                            คลิกหรือลากไฟล์เพื่อแนบ/เปลี่ยนใบงาน
                          </p>
                          <p className="text-[10px] text-slate-400">
                            รองรับ PDF, DOCX, PNG, JPG
                          </p>
                        </div>
                      </div>
                    )}

                    {editWorksheetUploadError && (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                        <span>{editWorksheetUploadError}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editAssignWorksheetName}
                      onChange={(e) => setEditAssignWorksheetName(e.target.value)}
                      placeholder="ชื่อใบงาน เช่น Lab3.pdf"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:border-indigo-400 outline-hidden"
                    />
                    <input
                      type="url"
                      value={editAssignWorksheetUrl}
                      onChange={(e) => setEditAssignWorksheetUrl(e.target.value)}
                      placeholder="ลิงก์ใบงาน (Google Drive)"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:border-indigo-400 outline-hidden"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isUpdatingAssign}
                  onClick={() => setEditingAssignment(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingAssign || editWorksheetUploading}
                  className="btn-pastel flex items-center justify-center gap-1.5 px-5 py-2 text-xs font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl shadow-pastel-sm cursor-pointer disabled:opacity-50"
                >
                  {isUpdatingAssign ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <span>บันทึกการแก้ไข</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Assignment Confirmation */}
      {deletingAssignmentId && (() => {
        const targetAssign = assignments.find((a) => a.id === deletingAssignmentId);

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white border border-rose-100 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-pastel space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-500 flex items-center justify-center shrink-0 shadow-2xs">
                  <Trash2 className="w-6 h-6 text-rose-500" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-slate-800">
                    ยืนยันการลบงานที่มอบหมาย
                  </h3>
                  {targetAssign && (
                    <p className="text-xs font-medium text-slate-500 truncate max-w-[260px]">
                      {targetAssign.courseCode} • {targetAssign.title}
                    </p>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-100/80 text-xs text-rose-800 leading-relaxed space-y-1">
                <p className="font-semibold text-rose-900">
                  คุณแน่ใจหรือไม่ว่าต้องการลบงานนี้?
                </p>
                <p className="text-slate-600 text-[11.5px]">
                  การลบจะทำให้ข้อมูลการส่งงานของนักศึกษาในงานนี้ถูกลบออกทั้งหมดและไม่สามารถกู้คืนได้
                </p>
              </div>

              {deleteError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span className="break-all">{deleteError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setDeletingAssignmentId(null);
                    setDeleteError(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="btn-pastel flex items-center justify-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-pastel-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังลบงาน...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>ยืนยันลบงาน</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Delete Submission Confirmation */}
      {deletingSubmission && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-rose-100 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-pastel space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-500 flex items-center justify-center shrink-0 shadow-2xs">
                <Trash2 className="w-6 h-6 text-rose-500" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-800">
                  ยืนยันการลบข้อมูลการส่งงาน
                </h3>
                <p className="text-xs font-medium text-slate-500 truncate max-w-[260px]">
                  {deletingSubmission.studentId} • {deletingSubmission.studentName}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-600">
                <span>รหัสนักศึกษา:</span>
                <span className="font-mono font-bold text-slate-900">{deletingSubmission.studentId}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>ชื่อ-นามสกุล:</span>
                <span className="font-semibold text-slate-900">{deletingSubmission.studentName}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>กลุ่มเรียน (Sec):</span>
                <span className="text-indigo-700 font-semibold">{deletingSubmission.sec} (เลขที่ {deletingSubmission.studentNo})</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>หมายเลขอ้างอิง:</span>
                <span className="font-mono font-bold text-indigo-600">{deletingSubmission.receiptId}</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-100/80 text-xs text-rose-800 leading-relaxed space-y-1">
              <p className="font-semibold text-rose-900">
                คุณแน่ใจหรือไม่ว่าต้องการลบการส่งงานนี้?
              </p>
              <p className="text-slate-600 text-[11.5px]">
                การลบจะมีผลทันทีและไม่สามารถกู้คืนได้
              </p>
            </div>

            {deleteSubError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span className="break-all">{deleteSubError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingSub}
                onClick={() => {
                  setDeletingSubmission(null);
                  setDeleteSubError(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isDeletingSub}
                onClick={handleConfirmDeleteSubmission}
                className="btn-pastel flex items-center justify-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-pastel-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeletingSub ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>กำลังลบข้อมูล...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>ยืนยันลบการส่งงาน</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: File & Link Preview */}
      {previewItem && (() => {
        const isOfflineOrNameOnly =
          !previewItem.url ||
          previewItem.url.includes('[บันทึกเฉพาะชื่อไฟล์]') ||
          previewItem.url.includes('[ไฟล์แนบในระบบ]') ||
          (!previewItem.url.startsWith('http://') &&
            !previewItem.url.startsWith('https://') &&
            !previewItem.url.startsWith('data:') &&
            !previewItem.url.startsWith('blob:'));

        const isImg = !isOfflineOrNameOnly && isImageUrl(previewItem.url, previewItem.fileName);
        const embedUrl = !isOfflineOrNameOnly && !isImg ? getEmbeddablePreviewUrl(previewItem.url, previewItem.fileName) : '';
        const isValidUrl = Boolean(
          !isOfflineOrNameOnly &&
            previewItem.url &&
            (previewItem.url.startsWith('http://') ||
              previewItem.url.startsWith('https://') ||
              previewItem.url.startsWith('data:') ||
              previewItem.url.startsWith('blob:'))
        );

        let domain = '';
        if (isValidUrl && !previewItem.url.startsWith('data:')) {
          try {
            domain = new URL(previewItem.url).hostname;
          } catch {
            domain = '';
          }
        }

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-white border border-slate-200/80 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
              {/* Modal Header */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/60 shrink-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60 font-mono">
                      {previewItem.studentId}
                    </span>
                    <span className="font-semibold text-slate-800 text-sm truncate">
                      {previewItem.studentName}
                    </span>
                  </div>
                  <h3 className="text-xs text-slate-500 mt-1 truncate flex items-center gap-1.5 font-medium">
                    {previewItem.type === 'file' ? (
                      <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    ) : (
                      <Globe className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    )}
                    <span className="truncate">{previewItem.fileName || previewItem.url}</span>
                  </h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isValidUrl && (
                    <a
                      href={previewItem.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-pastel inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-2xs hover:shadow-pastel cursor-pointer"
                      title="เปิดไฟล์หรือลิงก์ในแท็บใหม่ / ดาวน์โหลด"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">เปิดในแท็บใหม่ / ดาวน์โหลด</span>
                      <span className="sm:hidden">เปิดลิงก์</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setPreviewItem(null);
                      setIframeLoading(true);
                    }}
                    title="ปิดหน้าต่างตัวอย่าง"
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col items-center justify-center relative min-h-[380px] bg-slate-50/40">
                {(isImg || embedUrl) && iframeLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-2xs z-10 pointer-events-none">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
                    <p className="text-xs text-slate-500 font-medium">กำลังโหลดตัวอย่างผลงาน...</p>
                  </div>
                )}

                {isOfflineOrNameOnly ? (
                  <div className="max-w-md w-full bg-white rounded-3xl border border-amber-200/90 p-7 sm:p-8 text-center shadow-pastel-sm space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-2xs">
                      <HardDrive className="w-7 h-7" />
                    </div>
                    <div>
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 mb-2">
                        บันทึกเฉพาะชื่อไฟล์ในระบบ
                      </span>
                      <h4 className="text-base font-bold text-slate-800 break-all">
                        {previewItem.fileName || 'ไฟล์งานที่ส่ง'}
                      </h4>
                    </div>

                    <div className="p-4 bg-amber-50/80 rounded-2xl border border-amber-200/70 text-xs text-amber-900 text-left leading-relaxed">
                      โจทย์งานนี้สร้างขึ้นโดยไม่ได้ใส่ Google Apps Script Web App URL ทำให้มีเพียงข้อมูลชื่อไฟล์ ({previewItem.fileName || previewItem.url}) แต่ไม่มีไฟล์จริงในระบบ
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setPreviewItem(null);
                        setActiveTab('gas_guide');
                      }}
                      className="btn-pastel inline-flex items-center justify-center gap-2 w-full py-3 px-5 rounded-2xl font-medium text-xs sm:text-sm text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-pastel-sm hover:shadow-pastel cursor-pointer"
                    >
                      <HardDrive className="w-4 h-4" />
                      <span>วิธีตั้งค่า Google Apps Script</span>
                    </button>
                  </div>
                ) : isImg ? (
                  <div className="w-full flex items-center justify-center">
                    <img
                      src={previewItem.url}
                      alt="Student Submission"
                      className="max-h-[75vh] w-auto mx-auto rounded-xl object-contain shadow-sm"
                      onLoad={() => setIframeLoading(false)}
                      onError={() => setIframeLoading(false)}
                    />
                  </div>
                ) : embedUrl ? (
                  <iframe
                    src={embedUrl}
                    className="w-full h-[75vh] rounded-xl border border-slate-200 bg-white"
                    title="Submission Preview"
                    allow="autoplay"
                    onLoad={() => setIframeLoading(false)}
                    onError={() => setIframeLoading(false)}
                  />
                ) : (
                  <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200/80 p-8 text-center shadow-pastel-sm">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-2xs">
                      {previewItem.type === 'file' ? <FileText className="w-7 h-7" /> : <Globe className="w-7 h-7" />}
                    </div>
                    <h4 className="text-base font-bold text-slate-800">
                      {previewItem.fileName || (previewItem.type === 'file' ? 'ไฟล์งานที่ส่ง' : 'ลิงก์ผลงาน')}
                    </h4>
                    {domain && (
                      <span className="inline-block mt-1 px-3 py-0.5 rounded-full text-xs font-mono font-medium bg-slate-100 text-slate-600">
                        {domain}
                      </span>
                    )}
                    <p className="text-xs text-slate-500 mt-2 mb-6 break-all">
                      {previewItem.url}
                    </p>
                    {isValidUrl ? (
                      <a
                        href={previewItem.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-pastel inline-flex items-center justify-center gap-2 w-full py-3 px-5 rounded-2xl font-medium text-xs sm:text-sm text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-pastel-sm hover:shadow-pastel"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>เปิดในแท็บใหม่ / ดาวน์โหลด</span>
                      </a>
                    ) : (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs text-left">
                        <p className="font-semibold">ข้อมูลการส่งงาน:</p>
                        <p className="mt-1">
                          ไฟล์นี้ถูกบันทึกชื่อไว้ในระบบ ({previewItem.fileName || previewItem.url}) 
                          โดยยังไม่ได้เชื่อมต่อ Google Apps Script Web App เพื่อจัดเก็บไฟล์ลง Google Drive
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

