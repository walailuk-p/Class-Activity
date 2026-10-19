import React, { useState, useEffect } from 'react';
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
  GraduationCap,
  HardDrive,
  HelpCircle,
  Layers,
  Link as LinkIcon,
  Loader2,
  Lock,
  LogIn,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Share2,
  ShieldAlert,
  Trash2,
  Unlock,
  Upload,
  UserCheck,
  Users
} from 'lucide-react';
import { Course, Assignment, Submission, Student, SubmissionStatus, AcceptedFileType } from '../types';
import { loginWithGoogle } from '../firebase/config';
import { getCoursesByInstructor, createCourse, importStudentRoster, getStudentsByCourse } from '../services/courseService';
import {
  createAssignment,
  getAssignmentsByInstructor,
  toggleAssignmentStatus,
  extendAssignmentDeadline,
  deleteAssignment
} from '../services/assignmentService';
import {
  subscribeToAssignmentSubmissions,
  overrideSubmissionStatus,
  exportSubmissionsToCsv
} from '../services/submissionService';
import { GAS_TEMPLATE_CODE } from '../services/gasService';

interface TeacherPortalProps {
  user: User | null;
  authLoading: boolean;
}

export const TeacherPortal: React.FC<TeacherPortalProps> = ({ user, authLoading }) => {
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

  // CSV Import State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResultMsg, setCsvResultMsg] = useState<{ success: boolean; message: string } | null>(null);

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

  // Initial load
  useEffect(() => {
    if (user) {
      loadCourses();
      loadAssignments();
    }
  }, [user]);

  // Set default dates for new assignment
  useEffect(() => {
    const now = new Date();
    const isoNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setAssignOpenAt(isoNow);
    setAssignCloseAt(nextWeek);
  }, []);

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

    // Also load students of this assignment's course for full cross-check
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

  const handleImportRoster = async () => {
    if (!csvFile || !selectedCourseId || !user) return;
    setCsvImporting(true);
    setCsvResultMsg(null);

    try {
      const text = await csvFile.text();
      const res = await importStudentRoster(text, selectedCourseId, user.uid);
      setCsvResultMsg({
        success: true,
        message: `นำเข้ารายชื่อสำเร็จ ${res.imported} คน (ตรวจพบกลุ่มเรียน: ${res.sectionsFound.join(', ') || 'ไม่มี'})`
      });
      loadStudents(selectedCourseId);
      setCsvFile(null);
    } catch (err: any) {
      setCsvResultMsg({
        success: false,
        message: 'นำเข้ารายชื่อไม่สำเร็จ: ' + err.message
      });
    } finally {
      setCsvImporting(false);
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
      // Reset form
      setAssignTitle('');
      setAssignDesc('');
      setAssignWorksheetUrl('');
      setAssignWorksheetName('');
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

  const handleDeleteAssign = async (assignId: string) => {
    if (!confirm('ยืนยันลบงานนี้หรือไม่? (ข้อมูลการส่งงานของนักศึกษาจะยังคงอยู่ในระบบ)')) return;
    try {
      await deleteAssignment(assignId);
      setAssignments(assignments.filter((a) => a.id !== assignId));
      if (selectedAssignment?.id === assignId) setSelectedAssignment(null);
    } catch (err: any) {
      alert('ลบงานไม่สำเร็จ: ' + err.message);
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
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 bg-slate-50">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200/80 p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">เข้าสู่ระบบอาจารย์ผู้สอน</h2>
          <p className="text-sm text-slate-600 mt-2">
            สำหรับการบริหารจัดการรายวิชา มอบหมายงาน ตรวจสอบการส่งงาน และดึงรายงานสรุปผล
          </p>

          <div className="my-6 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-left text-xs text-amber-800 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>การพิสูจน์ตัวตนผ่าน Google Workspace</span>
            </div>
            <p>แนะนำให้เข้าสู่ระบบด้วยบัญชีสถาบัน (@bu.ac.th) เพื่อความถูกต้องของข้อมูลบุคคล</p>
          </div>

          <button
            onClick={() => loginWithGoogle()}
            disabled={authLoading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-98 transition-all shadow-md shadow-indigo-200"
          >
            <LogIn className="w-5 h-5" />
            <span>เข้าสู่ระบบด้วย Google</span>
          </button>
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

  // Calculate analytics for selected assignment
  const totalSubmissions = submissions.length;
  const onTimeCount = submissions.filter((s) => s.status === 'on_time').length;
  const lateCount = submissions.filter((s) => s.status === 'late').length;
  const leaveCount = submissions.filter((s) => s.status === 'personal_leave' || s.status === 'sick_leave').length;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/50 pb-12">
      {/* Teacher Dashboard Top Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 overflow-x-auto gap-4 no-scrollbar">
            <nav className="flex space-x-1 sm:space-x-2 shrink-0">
              <button
                onClick={() => setActiveTab('assignments')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'assignments'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>งานที่มอบหมาย</span>
                <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-[11px] text-slate-700 font-mono">
                  {assignments.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('create_assignment')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'create_assignment'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>สร้างงานใหม่</span>
              </button>

              <button
                onClick={() => setActiveTab('courses')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'courses'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>วิชา & รายชื่อนักศึกษา</span>
              </button>

              <button
                onClick={() => setActiveTab('submissions')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'submissions'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileCheck2 className="w-4 h-4" />
                <span>ตรวจงาน & รายงานสรุป</span>
                {selectedAssignment && (
                  <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-[11px] text-indigo-800 font-mono">
                    {selectedAssignment.code}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('gas_guide')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'gas_guide'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HardDrive className="w-4 h-4" />
                <span>Google Drive (Spark ฟรี)</span>
              </button>
            </nav>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* ================= TAB 1: ASSIGNMENTS LIST ================= */}
        {activeTab === 'assignments' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">งานที่มอบหมายทั้งหมด</h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  แจกรหัส 6 หลัก หรือแชร์ลิงก์ให้นักศึกษาส่งงานได้ทันทีโดยไม่ต้อง Log In
                </p>
              </div>
              <button
                onClick={() => setActiveTab('create_assignment')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs sm:text-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>สร้างงานใหม่</span>
              </button>
            </div>

            {assignmentsLoading ? (
              <div className="flex items-center justify-center p-12 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : assignments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                  <FilePlus className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-800">ยังไม่มีงานที่มอบหมาย</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  เริ่มต้นด้วยการเพิ่มรายวิชาและสร้างงานเพื่อรับรหัส 6 หลักสำหรับแจกนักศึกษา
                </p>
                <div className="mt-4 flex justify-center gap-3">
                  <button
                    onClick={() => setActiveTab('courses')}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    จัดการรายวิชา
                  </button>
                  <button
                    onClick={() => setActiveTab('create_assignment')}
                    className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                  >
                    สร้างงานแรก
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {assignments.map((assign) => {
                  const isClosed = assign.status === 'closed';
                  const isExpired = new Date() > new Date(assign.closeAt);

                  return (
                    <div
                      key={assign.id}
                      className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
                    >
                      <div className="p-5">
                        {/* Course & Section Tag */}
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                          <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                            {assign.courseCode} • {assign.sec === 'ALL' ? 'ทุกกลุ่ม (All Sec)' : assign.sec}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md font-medium text-[11px] ${
                              isClosed
                                ? 'bg-slate-100 text-slate-600'
                                : isExpired
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {isClosed ? 'ปิดรับงาน' : isExpired ? 'เลยกำหนดส่ง' : 'เปิดรับงาน'}
                          </span>
                        </div>

                        {/* Title */}
                        <h3 className="font-bold text-slate-900 text-base leading-snug line-clamp-2">
                          {assign.title}
                        </h3>
                        {assign.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{assign.description}</p>
                        )}

                        {/* Assignment Code Highlight - Projector Friendly */}
                        <div className="mt-4 p-3 rounded-xl bg-slate-900 text-white flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">
                              รหัสส่งงาน 6 หลัก
                            </p>
                            <p className="font-mono text-2xl font-bold tracking-[0.2em] text-indigo-300">
                              {assign.code}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleCopyCode(assign.code)}
                              title="คัดลอกรหัส"
                              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                            >
                              {copiedCode === assign.code ? (
                                <Check className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleCopyLink(assign.code)}
                              title="คัดลอกลิงก์ให้นักศึกษา"
                              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                            >
                              {copiedLink === assign.code ? (
                                <Check className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <Share2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Due Date & Details */}
                        <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>ปิดรับ: {new Date(assign.closeAt).toLocaleString('th-TH')}</span>
                          </div>
                          {assign.worksheetUrl && (
                            <div className="flex items-center gap-1.5 text-indigo-600">
                              <FileText className="w-3.5 h-3.5" />
                              <span className="truncate">มีใบงาน: {assign.worksheetName || 'แนบไว้'}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-2">
                        <button
                          onClick={() => {
                            setSelectedAssignment(assign);
                            setActiveTab('submissions');
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 shadow-2xs transition-colors"
                        >
                          <FileCheck2 className="w-3.5 h-3.5" />
                          <span>ดูงานที่ส่ง</span>
                        </button>

                        <button
                          onClick={() => handleToggleStatus(assign)}
                          title={isClosed ? 'เปิดรับงาน' : 'ปิดรับงาน'}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            isClosed
                              ? 'text-emerald-700 bg-white border-emerald-200 hover:bg-emerald-50'
                              : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {isClosed ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        </button>

                        <button
                          onClick={() => {
                            setExtendModalAssignment(assign);
                            setExtendDatetime(new Date(assign.closeAt).toISOString().slice(0, 16));
                          }}
                          title="ขยายเวลาส่ง"
                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                          <Clock className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDeleteAssign(assign.id)}
                          title="ลบงาน"
                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors"
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
          <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900">สร้างงานที่มอบหมาย (New Assignment)</h2>
              <p className="text-xs text-slate-500 mt-1">
                ระบบจะสร้างรหัส 6 หลักอัตโนมัติ พร้อมลิงก์ที่แชร์ให้นักศึกษาเปิดส่งงานได้ทันที
              </p>
            </div>

            <form onSubmit={handleCreateAssignment} className="space-y-5">
              {/* Select Course & Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    เลือกรายวิชา *
                  </label>
                  {courses.length === 0 ? (
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                      ยังไม่มีรายวิชา กรุณาไปที่แท็บ "วิชา & รายชื่อ" เพื่อเพิ่มวิชาก่อน
                    </div>
                  ) : (
                    <select
                      value={assignCourseId}
                      onChange={(e) => setAssignCourseId(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:bg-white focus:border-indigo-600 focus:outline-hidden"
                    >
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} - {c.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    กลุ่มเรียน (Section)
                  </label>
                  <select
                    value={assignSec}
                    onChange={(e) => setAssignSec(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:bg-white focus:border-indigo-600 focus:outline-hidden"
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

              {/* Assignment Title */}
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
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-600 focus:outline-hidden"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  คำอธิบายหรือคำแนะนำในการทำ (Description)
                </label>
                <textarea
                  rows={3}
                  value={assignDesc}
                  onChange={(e) => setAssignDesc(e.target.value)}
                  placeholder="รายละเอียด ข้อกำหนด และเงื่อนไขการส่งงาน..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-600 focus:outline-hidden"
                />
              </div>

              {/* Open & Close DateTime */}
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
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-sans focus:bg-white focus:border-indigo-600 focus:outline-hidden"
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
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-sans focus:bg-white focus:border-indigo-600 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Options & Constraints */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <span className="block text-xs font-bold text-slate-800">เงื่อนไขการส่งงาน</span>

                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignAllowLate}
                      onChange={(e) => setAssignAllowLate(e.target.checked)}
                      className="rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>อนุญาตให้ส่งช้าได้ (ระบบจะทำเครื่องหมาย "ส่งช้า")</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignAllowResubmit}
                      onChange={(e) => setAssignAllowResubmit(e.target.checked)}
                      className="rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>อนุญาตให้ส่งซ้ำก่อนปิดรับได้ (ใช้ไฟล์ล่าสุด)</span>
                  </label>
                </div>

                <div className="pt-2 border-t border-slate-200/60 flex items-center gap-4">
                  <span className="text-xs text-slate-600 font-medium">ขนาดไฟล์สูงสุด:</span>
                  <select
                    value={assignMaxMB}
                    onChange={(e) => setAssignMaxMB(Number(e.target.value))}
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                  >
                    <option value={5}>5 MB</option>
                    <option value={10}>10 MB (มาตรฐาน)</option>
                    <option value={15}>15 MB</option>
                  </select>
                </div>
              </div>

              {/* Worksheet Attachment */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">อัพโหลดใบงาน (Worksheet) ให้นักศึกษาดาวน์โหลด</span>
                  <span className="text-[11px] text-slate-500">(ไม่บังคับ)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">ชื่อใบงาน</label>
                    <input
                      type="text"
                      value={assignWorksheetName}
                      onChange={(e) => setAssignWorksheetName(e.target.value)}
                      placeholder="เช่น Worksheet_Lab3.pdf"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">ลิงก์ใบงาน (Google Drive / OneDrive / URL)</label>
                    <input
                      type="url"
                      value={assignWorksheetUrl}
                      onChange={(e) => setAssignWorksheetUrl(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Google Apps Script Web App URL for Google Drive storage */}
              <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900">
                    Google Apps Script Web App URL (สำหรับเก็บไฟล์ลง Google Drive)
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('gas_guide')}
                    className="text-[11px] font-semibold text-indigo-700 hover:underline flex items-center gap-1"
                  >
                    <HelpCircle className="w-3 h-3" />
                    ดูวิธีติดตั้ง
                  </button>
                </div>
                <input
                  type="url"
                  value={assignGasUrl}
                  onChange={(e) => setAssignGasUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-xs font-mono"
                />
                <p className="text-[11px] text-indigo-800">
                  *ช่วยให้บันทึกไฟล์งานขนาดไม่เกิน 10MB ลง Google Drive ของคุณโดยตรง ฟรี ไม่ต้องใช้ Firebase Storage (Blaze plan)
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={assignCreating || courses.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-98 transition-all shadow-md shadow-indigo-200 disabled:opacity-50"
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
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">จัดการรายวิชาและรายชื่อนักศึกษา</h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  นำเข้ารายชื่อผ่านไฟล์ CSV (รองรับภาษาไทย UTF-8) เพื่อให้นักศึกษายืนยันตัวตนก่อนส่งงาน
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={downloadSampleCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-2xs"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>ดาวน์โหลดตัวอย่าง CSV</span>
                </button>
                <button
                  onClick={() => setShowNewCourseModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>เพิ่มรายวิชา</span>
                </button>
              </div>
            </div>

            {/* Course Selector Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {courses.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedCourseId(c.id);
                    loadStudents(c.id);
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    selectedCourseId === c.id
                      ? 'bg-indigo-50/70 border-indigo-500 ring-2 ring-indigo-200'
                      : 'bg-white border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-indigo-700 text-sm">{c.code}</span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {c.sections.length} กลุ่ม
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-900 text-sm line-clamp-1">{c.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.sections.map((s) => (
                      <span key={s} className="px-1.5 py-0.5 rounded-sm bg-white border border-slate-200 text-[10px] text-slate-600">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Roster Import & List Area */}
            {selectedCourseId && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
                {/* CSV Import Banner */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      <span>นำเข้ารายชื่อนักศึกษาผ่าน CSV (UTF-8)</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      ต้องมีคอลัมน์: เลขที่, รหัสนักศึกษา, ชื่อ-นามสกุล, Sec (และอีเมลสถาบันเป็นข้อมูลเสริม)
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setCsvFile(e.target.files[0]);
                        }
                      }}
                      className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-white file:text-slate-700 hover:file:bg-slate-100 cursor-pointer"
                    />
                    <button
                      onClick={handleImportRoster}
                      disabled={!csvFile || csvImporting}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-2xs"
                    >
                      {csvImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      <span>{csvImporting ? 'กำลังนำเข้า...' : 'อัพโหลด CSV'}</span>
                    </button>
                  </div>
                </div>

                {csvResultMsg && (
                  <div
                    className={`p-3.5 rounded-xl text-xs flex items-start gap-2 ${
                      csvResultMsg.success
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border border-rose-200 text-rose-800'
                    }`}
                  >
                    {csvResultMsg.success ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span>{csvResultMsg.message}</span>
                  </div>
                )}

                {/* Students Table */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-800">
                      รายชื่อนักศึกษาในวิชานี้ ({courseStudents.length} คน)
                    </h3>
                  </div>

                  {courseStudents.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      ยังไม่มีรายชื่อนักศึกษา นำเข้าไฟล์ CSV ด้านบนเพื่อเริ่มต้น
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-2.5">เลขที่</th>
                            <th className="px-4 py-2.5">รหัสนักศึกษา</th>
                            <th className="px-4 py-2.5">ชื่อ-นามสกุล</th>
                            <th className="px-4 py-2.5">กลุ่ม (Sec)</th>
                            <th className="px-4 py-2.5">อีเมลสถาบัน</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {courseStudents.map((st) => (
                            <tr key={st.id} className="hover:bg-slate-50/60">
                              <td className="px-4 py-2.5 font-medium text-slate-500">{st.studentNo}</td>
                              <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">{st.studentId}</td>
                              <td className="px-4 py-2.5 font-medium text-slate-800">{st.fullName}</td>
                              <td className="px-4 py-2.5">
                                <span className="px-2 py-0.5 rounded-sm bg-slate-100 text-slate-700 font-mono">
                                  {st.sec}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-slate-500">{st.email || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: SUBMISSIONS & ANALYTICS ================= */}
        {activeTab === 'submissions' && (
          <div className="space-y-6">
            {/* Header & Assignment Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">ตรวจงาน & รายงานสรุปผล</h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  อัพเดตแบบ Real-time ทันทีที่นักศึกษาส่งงาน พร้อมฟังก์ชันปรับสถานะและส่งออก CSV
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedAssignment?.id || ''}
                  onChange={(e) => {
                    const found = assignments.find((a) => a.id === e.target.value);
                    setSelectedAssignment(found || null);
                  }}
                  className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 shadow-2xs"
                >
                  <option value="">-- เลือกงานที่ต้องการตรวจ --</option>
                  {assignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.courseCode}: {a.title} ({a.code})
                    </option>
                  ))}
                </select>

                {selectedAssignment && (
                  <button
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>ส่งออก CSV (สำหรับ Excel)</span>
                  </button>
                )}
              </div>
            </div>

            {selectedAssignment ? (
              <div className="space-y-6">
                {/* Analytics Summary Banner */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase">ส่งงานแล้วทั้งหมด</span>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{totalSubmissions} คน</p>
                    <span className="text-[11px] text-slate-400">จากนักศึกษาที่ลงทะเบียน</span>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[11px] font-semibold text-emerald-700 uppercase">ส่งตรงเวลา</span>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">{onTimeCount} คน</p>
                    <span className="text-[11px] text-emerald-700 font-medium">
                      {totalSubmissions > 0 ? ((onTimeCount / totalSubmissions) * 100).toFixed(0) : 0}% ของที่ส่ง
                    </span>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[11px] font-semibold text-amber-700 uppercase">ส่งช้า (Late)</span>
                    <p className="text-2xl font-bold text-amber-600 mt-1">{lateCount} คน</p>
                    <span className="text-[11px] text-amber-700 font-medium">
                      {totalSubmissions > 0 ? ((lateCount / totalSubmissions) * 100).toFixed(0) : 0}% ของที่ส่ง
                    </span>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[11px] font-semibold text-indigo-700 uppercase">ลากิจ / ลาป่วย</span>
                    <p className="text-2xl font-bold text-indigo-600 mt-1">{leaveCount} คน</p>
                    <span className="text-[11px] text-indigo-700 font-medium">อาจารย์บันทึกไว้</span>
                  </div>
                </div>

                {/* Submissions Filter & Search */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 max-w-md">
                      <div className="relative w-full">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="ค้นหารหัสนักศึกษา, ชื่อ หรือหมายเลข Receipt..."
                          className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-indigo-600 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
                      >
                        <option value="all">สถานะทั้งหมด</option>
                        <option value="on_time">ส่งตรงเวลา</option>
                        <option value="late">ส่งช้า</option>
                        <option value="personal_leave">ลากิจ</option>
                        <option value="sick_leave">ลาป่วย</option>
                      </select>
                    </div>
                  </div>

                  {/* Real-time Submissions Table */}
                  {subsLoading ? (
                    <div className="py-12 flex justify-center text-slate-400">
                      <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                  ) : filteredSubmissions.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      ยังไม่มีนักศึกษาส่งงานในตัวกรองนี้
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                          <tr>
                            <th className="px-3.5 py-2.5">เลขที่</th>
                            <th className="px-3.5 py-2.5">รหัสนักศึกษา</th>
                            <th className="px-3.5 py-2.5">ชื่อ-นามสกุล</th>
                            <th className="px-3.5 py-2.5">กลุ่ม</th>
                            <th className="px-3.5 py-2.5">เวลาที่ส่ง</th>
                            <th className="px-3.5 py-2.5">สถานะ</th>
                            <th className="px-3.5 py-2.5">ไฟล์ / ลิงก์</th>
                            <th className="px-3.5 py-2.5">รหัส Receipt</th>
                            <th className="px-3.5 py-2.5">คะแนน / ข้อเสนอแนะ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredSubmissions.map((sub) => (
                            <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-3.5 py-3 font-medium text-slate-500">{sub.studentNo}</td>
                              <td className="px-3.5 py-3 font-mono font-bold text-slate-900">{sub.studentId}</td>
                              <td className="px-3.5 py-3 font-medium text-slate-800">{sub.studentName}</td>
                              <td className="px-3.5 py-3">
                                <span className="px-2 py-0.5 rounded-sm bg-slate-100 text-slate-700 font-mono">
                                  {sub.sec}
                                </span>
                              </td>
                              <td className="px-3.5 py-3 text-slate-500">
                                {new Date(sub.submittedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </td>
                              <td className="px-3.5 py-3">
                                <select
                                  value={sub.status}
                                  onChange={(e) =>
                                    handleOverrideStatus(sub.id, e.target.value as SubmissionStatus)
                                  }
                                  className={`text-xs font-semibold px-2 py-1 rounded-md border cursor-pointer ${
                                    sub.status === 'on_time'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : sub.status === 'late'
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : sub.status === 'personal_leave' || sub.status === 'sick_leave'
                                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                      : 'bg-rose-50 text-rose-800 border-rose-200'
                                  }`}
                                >
                                  <option value="on_time">ส่งตรงเวลา</option>
                                  <option value="late">ส่งช้า</option>
                                  <option value="missing">ไม่ส่ง / ขาดส่ง</option>
                                  <option value="personal_leave">ลากิจ</option>
                                  <option value="sick_leave">ลาป่วย</option>
                                </select>
                              </td>
                              <td className="px-3.5 py-3">
                                {sub.submissionType === 'file' && sub.fileUrl ? (
                                  <a
                                    href={sub.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium hover:underline max-w-[150px] truncate"
                                  >
                                    <FileText className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">{sub.fileName || 'เปิดไฟล์'}</span>
                                  </a>
                                ) : sub.workLink ? (
                                  <a
                                    href={sub.workLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium hover:underline max-w-[150px] truncate"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                    <span>เปิดลิงก์งาน</span>
                                  </a>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                              <td className="px-3.5 py-3 font-mono text-[11px] text-slate-500">
                                {sub.receiptId}
                              </td>
                              <td className="px-3.5 py-3">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    defaultValue={sub.score ?? ''}
                                    onBlur={(e) => {
                                      const val = e.target.value === '' ? null : Number(e.target.value);
                                      handleOverrideStatus(sub.id, sub.status, sub.feedback, val);
                                    }}
                                    placeholder="คะแนน"
                                    className="w-14 px-1.5 py-1 text-center bg-slate-50 border border-slate-200 rounded-md text-xs font-mono"
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 text-xs">
                กรุณาเลือกงานที่ต้องการตรวจจากเมนูด้านบน
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 5: GOOGLE DRIVE (SPARK FREE PLAN) GUIDE ================= */}
        {activeTab === 'gas_guide' && (
          <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
            <div>
              <div className="inline-flex p-3 rounded-2xl bg-indigo-50 text-indigo-600 mb-3">
                <HardDrive className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                วิธีเก็บไฟล์งานนักศึกษาใน Google Drive ด้วย Google Apps Script
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                เพื่อใช้งานภายใต้ Firebase Spark Plan (ฟรี 100% ไม่มีค่าใช้จ่าย) โดยไม่จำเป็นต้องใช้ Firebase Storage (Blaze Plan)
              </p>
            </div>

            {/* Quick Steps */}
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs text-slate-700">
                <span className="font-bold text-slate-900 block text-sm">ขั้นตอนการติดตั้ง (ใช้เวลาเพียง 2 นาที):</span>
                <ol className="list-decimal list-inside space-y-2 leading-relaxed">
                  <li>
                    เปิดเว็บไซต์{' '}
                    <a
                      href="https://script.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 font-semibold underline"
                    >
                      script.google.com
                    </a>{' '}
                    ด้วยบัญชี Google ของท่าน แล้วกดปุ่ม <strong>"New project" (โครงการใหม่)</strong>
                  </li>
                  <li>ลบโค้ดเดิมทั้งหมดในหน้าต่างนั้น แล้วคัดลอกโค้ดด้านล่างนี้ไปวาง</li>
                  <li>
                    กดปุ่ม <strong>"Deploy" (การทำให้ใช้งานได้)</strong> ที่มุมขวาบน &rarr; เลือก <strong>"New deployment" (การทำให้ใช้งานได้รายการใหม่)</strong>
                  </li>
                  <li>
                    กดไอคอนรูปฟันเฟือง เลือกประเภท <strong>"Web app" (เว็บแอป)</strong>
                  </li>
                  <li>
                    ตั้งค่าสำคัญ:
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-1 text-slate-800">
                      <li><strong>Execute as:</strong> "Me" (ตัวฉัน)</li>
                      <li>
                        <strong>Who has access:</strong> <span className="text-emerald-700 font-bold">"Anyone" (ทุกคน)</span>{' '}
                        *(สำคัญมาก เพื่อให้นักศึกษาส่งไฟล์ได้โดยไม่ต้องล็อกอิน)*
                      </li>
                    </ul>
                  </li>
                  <li>กด <strong>"Deploy"</strong> และกด <strong>"Authorize access"</strong> (อนุญาตให้เข้าถึง Google Drive ของคุณ)</li>
                  <li>คัดลอก <strong>Web app URL</strong> (ที่ลงท้ายด้วย <code>/exec</code>) นำมาวางในระบบ ClassWork ได้เลย!</li>
                </ol>
              </div>

              {/* Code Box */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700">โค้ด Google Apps Script (พร้อมใช้งานทันที):</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(GAS_TEMPLATE_CODE);
                      setCopiedGasCode(true);
                      setTimeout(() => setCopiedGasCode(false), 2000);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-2xs"
                  >
                    {copiedGasCode ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedGasCode ? 'คัดลอกโค้ดแล้ว!' : 'คัดลอกโค้ดทั้งหมด'}</span>
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-80 leading-relaxed">
                  {GAS_TEMPLATE_CODE}
                </pre>
              </div>

              {/* Netlify & GitHub Note */}
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                <span className="font-bold block">การ Deploy บน Netlify & GitHub:</span>
                <p>
                  โปรเจกต์นี้เขียนด้วย Pure Client-side React + Vite + Firebase Client SDK จึงสามารถ Build และ Deploy บน Netlify ได้โดยตรง 100% โดยเชื่อมกับ GitHub repository ของคุณ และรันคำสั่ง <code>npm run build</code> (Publish directory: <code>dist</code>) ได้อย่างสมบูรณ์แบบโดยไม่ต้องใช้ Google Cloud Run
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: New Course */}
      {showNewCourseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">เพิ่มรายวิชาใหม่</h3>
            <form onSubmit={handleCreateCourse} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">รหัสวิชา (Course Code)</label>
                <input
                  type="text"
                  required
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value.toUpperCase())}
                  placeholder="เช่น CS101, IT202"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase focus:bg-white focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ชื่อวิชา (Course Title)</label>
                <input
                  type="text"
                  required
                  value={newCourseTitle}
                  onChange={(e) => setNewCourseTitle(e.target.value)}
                  placeholder="เช่น การพัฒนาเว็บแอปพลิเคชัน"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">กลุ่มเรียน (Sections คั่นด้วยจุลภาค)</label>
                <input
                  type="text"
                  value={newCourseSecs}
                  onChange={(e) => setNewCourseSecs(e.target.value)}
                  placeholder="เช่น Sec 1, Sec 2, Sec 3"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewCourseModal(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                >
                  บันทึกรายวิชา
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Extend Deadline */}
      {extendModalAssignment && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">ขยายเวลาส่งงาน</h3>
            <p className="text-xs text-slate-500">
              {extendModalAssignment.courseCode}: {extendModalAssignment.title}
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">กำหนดส่งใหม่</label>
              <input
                type="datetime-local"
                value={extendDatetime}
                onChange={(e) => setExtendDatetime(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-sans"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setExtendModalAssignment(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleExtendDeadline}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >
                บันทึกการขยายเวลา
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
