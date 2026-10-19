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
  LogOut,
  MoreVertical,
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
  Users
} from 'lucide-react';
import { Course, Assignment, Submission, Student, SubmissionStatus, AcceptedFileType } from '../types';
import { loginWithGoogle, logout } from '../firebase/config';
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
  onExitPortal?: () => void;
}

export const TeacherPortal: React.FC<TeacherPortalProps> = ({ user, authLoading, onExitPortal }) => {
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
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 bg-[#FFFDF7] cute-confetti-bg">
        <div className="max-w-md w-full bg-white/95 rounded-[32px] border-2 border-purple-200/90 p-8 text-center shadow-pillow">
          <div className="w-16 h-16 rounded-[24px] bg-purple-100 border-2 border-purple-300 text-purple-600 flex items-center justify-center mx-auto mb-4 shadow-pillow-sm">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-['Fredoka',sans-serif] font-bold text-purple-950">
            เข้าสู่ระบบคุณครู/อาจารย์
          </h2>
          <p className="text-xs sm:text-sm text-purple-700/80 mt-1">
            สำหรับการจัดการวิชา มอบหมายงาน ตรวจงาน และดาวน์โหลดรายงาน
          </p>

          <div className="my-6 p-4 rounded-2xl bg-purple-50/80 border border-purple-200 text-left text-xs text-purple-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-purple-800">
              <ShieldAlert className="w-4 h-4 text-purple-600 shrink-0" />
              <span>การพิสูจน์ตัวตนผ่าน Google</span>
            </div>
            <p className="text-purple-700/80">แนะนำเข้าสู่ระบบด้วยอีเมลสถาบัน (@bu.ac.th หรืออีเมลอาจารย์)</p>
          </div>

          <button
            onClick={() => loginWithGoogle()}
            disabled={authLoading}
            className="w-full btn-cute flex items-center justify-center gap-3 py-3.5 px-6 rounded-full font-bold text-white bg-gradient-to-r from-purple-400 via-purple-500 to-fuchsia-400 shadow-pillow-sm cursor-pointer"
          >
            <LogIn className="w-5 h-5" />
            <span>เข้าสู่ระบบด้วย Google</span>
          </button>

          {onExitPortal && (
            <button
              onClick={onExitPortal}
              className="mt-4 text-xs font-semibold text-purple-500 hover:text-purple-800 transition-colors"
            >
              ← กลับไปหน้าส่งงานนักศึกษา
            </button>
          )}
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
    <div className="min-h-[calc(100vh-4rem)] bg-[#FFFDF7] pb-16 cute-confetti-bg">
      {/* Teacher Dashboard Sub-Header */}
      <div className="bg-white/90 border-b border-purple-100 sticky top-16 z-30 backdrop-blur-md shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 overflow-x-auto gap-4 no-scrollbar">
            <nav className="flex space-x-1 sm:space-x-2 shrink-0">
              <button
                onClick={() => setActiveTab('assignments')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                  activeTab === 'assignments'
                    ? 'bg-purple-100 text-purple-900 border border-purple-300'
                    : 'text-purple-600 hover:text-purple-900'
                }`}
              >
                <Layers className="w-4 h-4 text-purple-500" />
                <span>งานที่มอบหมาย</span>
                <span className="px-2 py-0.2 rounded-full bg-white text-[11px] text-purple-700 font-bold border border-purple-200">
                  {assignments.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('create_assignment')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                  activeTab === 'create_assignment'
                    ? 'bg-purple-100 text-purple-900 border border-purple-300'
                    : 'text-purple-600 hover:text-purple-900'
                }`}
              >
                <Plus className="w-4 h-4 text-purple-500" />
                <span>สร้างงานใหม่</span>
              </button>

              <button
                onClick={() => setActiveTab('courses')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                  activeTab === 'courses'
                    ? 'bg-purple-100 text-purple-900 border border-purple-300'
                    : 'text-purple-600 hover:text-purple-900'
                }`}
              >
                <Users className="w-4 h-4 text-purple-500" />
                <span>วิชา & รายชื่อนักศึกษา</span>
              </button>

              <button
                onClick={() => setActiveTab('submissions')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                  activeTab === 'submissions'
                    ? 'bg-purple-100 text-purple-900 border border-purple-300'
                    : 'text-purple-600 hover:text-purple-900'
                }`}
              >
                <FileCheck2 className="w-4 h-4 text-purple-500" />
                <span>ตรวจงาน & สรุปผล</span>
                {selectedAssignment && (
                  <span className="px-2 py-0.2 rounded-full bg-purple-200 text-[11px] text-purple-900 font-bold">
                    {selectedAssignment.code}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('gas_guide')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                  activeTab === 'gas_guide'
                    ? 'bg-purple-100 text-purple-900 border border-purple-300'
                    : 'text-purple-600 hover:text-purple-900'
                }`}
              >
                <HardDrive className="w-4 h-4 text-purple-500" />
                <span>Google Drive (Spark ฟรี)</span>
              </button>
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-purple-900 truncate max-w-[130px] hidden sm:inline">
                {user.email}
              </span>
              <button
                onClick={() => logout()}
                title="ออกจากระบบ"
                className="p-1.5 text-purple-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors"
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
                <h1 className="text-2xl font-['Fredoka',sans-serif] font-bold text-purple-950">
                  งานที่มอบหมายทั้งหมด
                </h1>
                <p className="text-xs sm:text-sm text-purple-700/80">
                  แจกรหัส 6 หลักให้นักศึกษาส่งงานได้ทันทีโดยไม่ต้อง Log In
                </p>
              </div>
              <button
                onClick={() => setActiveTab('create_assignment')}
                className="btn-cute inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-purple-400 to-fuchsia-400 shadow-pillow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>สร้างงานใหม่</span>
              </button>
            </div>

            {assignmentsLoading ? (
              <div className="flex items-center justify-center p-12 text-purple-500">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : assignments.length === 0 ? (
              <div className="bg-white/95 rounded-[32px] border-2 border-purple-200/80 p-12 text-center shadow-pillow">
                <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-3">
                  <FilePlus className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-purple-950">ยังไม่มีงานที่มอบหมาย</h3>
                <p className="text-xs text-purple-700/70 mt-1 max-w-sm mx-auto">
                  กดปุ่มสร้างงานใหม่ด้านบนเพื่อสร้างงานและรับรหัส 6 หลักจ้า
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
                      className="bg-white/95 rounded-[28px] border-2 border-purple-200/90 shadow-pillow-sm hover:shadow-pillow transition-all flex flex-col justify-between overflow-hidden"
                    >
                      <div className="p-6">
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="font-['Fredoka',sans-serif] font-bold text-purple-800 bg-purple-100 px-3 py-0.5 rounded-full border border-purple-200">
                            {assign.courseCode} • {assign.sec === 'ALL' ? 'ทุกกลุ่ม' : assign.sec}
                          </span>
                          <span
                            className={`px-3 py-0.5 rounded-full font-bold text-[11px] ${
                              isClosed
                                ? 'bg-slate-100 text-slate-600'
                                : isExpired
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isClosed ? 'ปิดรับงาน' : isExpired ? 'เลยกำหนดส่ง' : 'เปิดรับงาน'}
                          </span>
                        </div>

                        <h3 className="font-bold text-purple-950 text-base leading-snug line-clamp-2">
                          {assign.title}
                        </h3>

                        {/* Cute Pastel Highlighted Code Box */}
                        <div className="mt-4 p-4 rounded-2xl bg-[#F5F3FF] border border-purple-200 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider">
                              รหัสส่งงาน 6 หลัก
                            </p>
                            <p className="font-['Fredoka',sans-serif] text-2xl font-bold tracking-[0.2em] text-purple-800">
                              {assign.code}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleCopyCode(assign.code)}
                              title="คัดลอกรหัส"
                              className="p-2 rounded-full bg-white border border-purple-200 hover:bg-purple-100 text-purple-700 transition-colors shadow-2xs"
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
                              className="p-2 rounded-full bg-white border border-purple-200 hover:bg-purple-100 text-purple-700 transition-colors shadow-2xs"
                            >
                              {copiedLink === assign.code ? (
                                <Check className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Share2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 space-y-1 text-xs text-purple-700/80">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-purple-400" />
                            <span>ปิดรับ: {new Date(assign.closeAt).toLocaleString('th-TH')}</span>
                          </div>
                        </div>
                      </div>

                      <div className="px-6 py-3.5 bg-purple-50/50 border-t border-purple-100 flex items-center justify-between gap-2">
                        <button
                          onClick={() => {
                            setSelectedAssignment(assign);
                            setActiveTab('submissions');
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-xs font-bold text-purple-800 bg-white border border-purple-300 hover:bg-purple-100 transition-all shadow-2xs cursor-pointer"
                        >
                          <FileCheck2 className="w-3.5 h-3.5 text-purple-600" />
                          <span>ดูงานที่ส่ง</span>
                        </button>

                        <button
                          onClick={() => handleToggleStatus(assign)}
                          title={isClosed ? 'เปิดรับงาน' : 'ปิดรับงาน'}
                          className="p-2 rounded-full border border-purple-200 bg-white text-purple-700 hover:bg-purple-100 transition-colors shadow-2xs"
                        >
                          {isClosed ? <Unlock className="w-4 h-4 text-emerald-600" /> : <Lock className="w-4 h-4 text-amber-600" />}
                        </button>

                        <button
                          onClick={() => {
                            setExtendModalAssignment(assign);
                            setExtendDatetime(new Date(assign.closeAt).toISOString().slice(0, 16));
                          }}
                          title="ขยายเวลาส่ง"
                          className="p-2 rounded-full border border-purple-200 bg-white text-purple-700 hover:bg-purple-100 transition-colors shadow-2xs"
                        >
                          <Clock className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDeleteAssign(assign.id)}
                          title="ลบงาน"
                          className="p-2 rounded-full border border-purple-200 bg-white text-purple-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shadow-2xs"
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
          <div className="max-w-2xl mx-auto bg-white/95 rounded-[32px] border-2 border-purple-200/90 p-7 sm:p-9 shadow-pillow">
            <div className="mb-6">
              <h2 className="text-2xl font-['Fredoka',sans-serif] font-bold text-purple-950">
                สร้างงานที่มอบหมาย
              </h2>
              <p className="text-xs sm:text-sm text-purple-700/80 mt-1">
                ระบบจะสร้างรหัส 6 หลักอัตโนมัติ ให้นักศึกษานำไปส่งงานได้ทันที
              </p>
            </div>

            <form onSubmit={handleCreateAssignment} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-purple-900 mb-1.5">
                    เลือกรายวิชา *
                  </label>
                  <select
                    value={assignCourseId}
                    onChange={(e) => setAssignCourseId(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-purple-50/60 border border-purple-200 rounded-full text-xs sm:text-sm font-medium text-purple-950 focus:border-purple-400 focus:outline-hidden"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-purple-900 mb-1.5">
                    กลุ่มเรียน (Section)
                  </label>
                  <select
                    value={assignSec}
                    onChange={(e) => setAssignSec(e.target.value)}
                    className="w-full px-4 py-2.5 bg-purple-50/60 border border-purple-200 rounded-full text-xs sm:text-sm font-medium text-purple-950 focus:border-purple-400 focus:outline-hidden"
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
                <label className="block text-xs font-semibold text-purple-900 mb-1.5">
                  ชื่องานที่มอบหมาย *
                </label>
                <input
                  type="text"
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  placeholder="เช่น ใบงานที่ 3: ออกแบบ Responsive Mobile UI"
                  required
                  className="w-full px-5 py-3 bg-purple-50/60 border border-purple-200 rounded-full text-sm text-purple-950 focus:border-purple-400 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-purple-900 mb-1.5">
                  คำอธิบายหรือคำแนะนำในการทำ (Description)
                </label>
                <textarea
                  rows={3}
                  value={assignDesc}
                  onChange={(e) => setAssignDesc(e.target.value)}
                  placeholder="รายละเอียด ข้อกำหนด และเงื่อนไขการส่งงาน..."
                  className="w-full px-5 py-3 bg-purple-50/60 border border-purple-200 rounded-2xl text-sm text-purple-950 focus:border-purple-400 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-purple-900 mb-1.5">
                    วัน-เวลาเปิดรับงาน
                  </label>
                  <input
                    type="datetime-local"
                    value={assignOpenAt}
                    onChange={(e) => setAssignOpenAt(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-purple-50/60 border border-purple-200 rounded-full text-xs text-purple-950 focus:border-purple-400 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-purple-900 mb-1.5">
                    วัน-เวลาปิดรับงาน (กำหนดส่ง)
                  </label>
                  <input
                    type="datetime-local"
                    value={assignCloseAt}
                    onChange={(e) => setAssignCloseAt(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-purple-50/60 border border-purple-200 rounded-full text-xs text-purple-950 focus:border-purple-400 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Options */}
              <div className="p-5 rounded-2xl bg-[#F5F3FF] border border-purple-200 space-y-3">
                <span className="block text-xs font-bold text-purple-900">เงื่อนไขการส่งงาน</span>
                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 text-xs font-medium text-purple-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignAllowLate}
                      onChange={(e) => setAssignAllowLate(e.target.checked)}
                      className="rounded-sm border-purple-300 text-purple-600 focus:ring-purple-400"
                    />
                    <span>อนุญาตให้ส่งช้าได้ (ระบบจะทำเครื่องหมาย "ส่งช้า")</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium text-purple-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignAllowResubmit}
                      onChange={(e) => setAssignAllowResubmit(e.target.checked)}
                      className="rounded-sm border-purple-300 text-purple-600 focus:ring-purple-400"
                    />
                    <span>อนุญาตให้ส่งซ้ำก่อนปิดรับได้ (ใช้ไฟล์ล่าสุด)</span>
                  </label>
                </div>
              </div>

              {/* Worksheet attachment */}
              <div className="p-5 rounded-2xl bg-[#F5F3FF] border border-purple-200 space-y-3">
                <span className="text-xs font-bold text-purple-900 block">
                  แนบใบงาน (Worksheet) ให้นักศึกษาดาวน์โหลด
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={assignWorksheetName}
                    onChange={(e) => setAssignWorksheetName(e.target.value)}
                    placeholder="ชื่อใบงาน เช่น Lab3.pdf"
                    className="w-full px-4 py-2 bg-white border border-purple-200 rounded-full text-xs text-purple-950"
                  />
                  <input
                    type="url"
                    value={assignWorksheetUrl}
                    onChange={(e) => setAssignWorksheetUrl(e.target.value)}
                    placeholder="ลิงก์ใบงาน (Google Drive)"
                    className="w-full px-4 py-2 bg-white border border-purple-200 rounded-full text-xs text-purple-950"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={assignCreating || courses.length === 0}
                className="w-full btn-cute flex items-center justify-center gap-2 py-3.5 px-6 rounded-full font-bold text-white bg-gradient-to-r from-purple-400 via-purple-500 to-fuchsia-400 shadow-pillow-sm disabled:opacity-40 cursor-pointer"
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
                <h1 className="text-2xl font-['Fredoka',sans-serif] font-bold text-purple-950">
                  จัดการรายวิชาและรายชื่อนักศึกษา
                </h1>
                <p className="text-xs sm:text-sm text-purple-700/80">
                  นำเข้ารายชื่อผ่าน CSV (รองรับภาษาไทย UTF-8) เพื่อให้นักศึกษายืนยันตัวตน
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={downloadSampleCsv}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-purple-800 bg-white border border-purple-200 hover:bg-purple-50 shadow-2xs"
                >
                  <FileDown className="w-3.5 h-3.5 text-purple-600" />
                  <span>ตัวอย่าง CSV</span>
                </button>
                <button
                  onClick={() => setShowNewCourseModal(true)}
                  className="btn-cute inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-white bg-gradient-to-r from-purple-400 to-fuchsia-400 shadow-pillow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>เพิ่มรายวิชา</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {courses.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedCourseId(c.id);
                    loadStudents(c.id);
                  }}
                  className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                    selectedCourseId === c.id
                      ? 'bg-purple-50/90 border-purple-400 shadow-pillow-sm'
                      : 'bg-white border-purple-200 hover:border-purple-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-['Fredoka',sans-serif] font-bold text-purple-800 text-sm">{c.code}</span>
                    <span className="text-[11px] text-purple-500 font-medium">{c.sections.length} กลุ่ม</span>
                  </div>
                  <h3 className="font-bold text-purple-950 text-sm line-clamp-1">{c.title}</h3>
                </div>
              ))}
            </div>

            {selectedCourseId && (
              <div className="bg-white/95 rounded-[32px] border-2 border-purple-200/90 p-7 shadow-pillow space-y-6">
                <div className="p-5 rounded-2xl bg-[#F5F3FF] border border-purple-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-purple-950 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      <span>นำเข้ารายชื่อนักศึกษาผ่าน CSV (UTF-8)</span>
                    </h3>
                    <p className="text-xs text-purple-700/80 mt-1">
                      คอลัมน์: เลขที่, รหัสนักศึกษา, ชื่อ-นามสกุล, Sec, อีเมลสถาบัน
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
                      className="text-xs text-purple-900 file:mr-2 file:py-1.5 file:px-3 file:rounded-full file:border file:border-purple-200 file:text-xs file:font-semibold file:bg-white file:text-purple-700 cursor-pointer"
                    />
                    <button
                      onClick={handleImportRoster}
                      disabled={!csvFile || csvImporting}
                      className="btn-cute inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 disabled:opacity-40 cursor-pointer shadow-soft-mint"
                    >
                      {csvImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      <span>{csvImporting ? 'กำลังนำเข้า...' : 'อัพโหลด CSV'}</span>
                    </button>
                  </div>
                </div>

                {csvResultMsg && (
                  <div
                    className={`p-4 rounded-2xl text-xs flex items-start gap-2.5 ${
                      csvResultMsg.success
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-pink-50 border border-pink-200 text-pink-800'
                    }`}
                  >
                    {csvResultMsg.success ? <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-pink-600" />}
                    <span>{csvResultMsg.message}</span>
                  </div>
                )}

                <div className="overflow-x-auto border border-purple-200 rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-purple-50 text-purple-900 font-bold uppercase border-b border-purple-200">
                      <tr>
                        <th className="px-4 py-2.5">เลขที่</th>
                        <th className="px-4 py-2.5">รหัสนักศึกษา</th>
                        <th className="px-4 py-2.5">ชื่อ-นามสกุล</th>
                        <th className="px-4 py-2.5">กลุ่ม (Sec)</th>
                        <th className="px-4 py-2.5">อีเมลสถาบัน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-100">
                      {courseStudents.map((st) => (
                        <tr key={st.id} className="hover:bg-purple-50/50">
                          <td className="px-4 py-2.5 text-purple-700 font-['Fredoka',sans-serif]">{st.studentNo}</td>
                          <td className="px-4 py-2.5 font-['Fredoka',sans-serif] font-bold text-purple-950">{st.studentId}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-800">{st.fullName}</td>
                          <td className="px-4 py-2.5 text-purple-700">{st.sec}</td>
                          <td className="px-4 py-2.5 text-slate-500">{st.email || '-'}</td>
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
                <h1 className="text-2xl font-['Fredoka',sans-serif] font-bold text-purple-950">
                  ตรวจงาน & สรุปผล
                </h1>
                <p className="text-xs sm:text-sm text-purple-700/80">
                  อัพเดตแบบ Real-time ทันทีที่นักศึกษาส่งงาน พร้อมส่งออก CSV
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedAssignment?.id || ''}
                  onChange={(e) => {
                    const found = assignments.find((a) => a.id === e.target.value);
                    setSelectedAssignment(found || null);
                  }}
                  className="px-4 py-2 bg-white border border-purple-200 rounded-full text-xs sm:text-sm font-semibold text-purple-950 focus:border-purple-400 shadow-2xs"
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
                    className="btn-cute inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 shadow-soft-mint cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>ส่งออก CSV (สำหรับ Excel)</span>
                  </button>
                )}
              </div>
            </div>

            {selectedAssignment && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-2xl border border-purple-200 shadow-2xs">
                    <span className="text-[10px] text-purple-600 font-bold uppercase">ส่งงานแล้วทั้งหมด</span>
                    <p className="text-2xl font-['Fredoka',sans-serif] font-bold text-purple-950 mt-1">{totalSubmissions} คน</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-purple-200 shadow-2xs">
                    <span className="text-[10px] text-emerald-600 font-bold uppercase">ส่งตรงเวลา</span>
                    <p className="text-2xl font-['Fredoka',sans-serif] font-bold text-emerald-600 mt-1">{onTimeCount} คน</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-purple-200 shadow-2xs">
                    <span className="text-[10px] text-amber-600 font-bold uppercase">ส่งช้า (LATE)</span>
                    <p className="text-2xl font-['Fredoka',sans-serif] font-bold text-amber-600 mt-1">{lateCount} คน</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-purple-200 shadow-2xs">
                    <span className="text-[10px] text-purple-600 font-bold uppercase">ลากิจ / ลาป่วย</span>
                    <p className="text-2xl font-['Fredoka',sans-serif] font-bold text-purple-600 mt-1">{leaveCount} คน</p>
                  </div>
                </div>

                <div className="bg-white/95 rounded-[32px] border-2 border-purple-200/90 p-6 space-y-4 shadow-pillow">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="relative w-full max-w-md">
                      <Search className="w-4 h-4 text-purple-400 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="ค้นหารหัสนักศึกษา, ชื่อ หรือ Receipt ID..."
                        className="w-full pl-10 pr-4 py-2 bg-purple-50/60 border border-purple-200 rounded-full text-xs text-purple-950 focus:border-purple-400"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-purple-200 rounded-2xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-purple-50 text-purple-900 font-bold uppercase border-b border-purple-200">
                        <tr>
                          <th className="px-3.5 py-2.5">เลขที่</th>
                          <th className="px-3.5 py-2.5">รหัส</th>
                          <th className="px-3.5 py-2.5">ชื่อ-นามสกุล</th>
                          <th className="px-3.5 py-2.5">กลุ่ม</th>
                          <th className="px-3.5 py-2.5">เวลาที่ส่ง</th>
                          <th className="px-3.5 py-2.5">สถานะ</th>
                          <th className="px-3.5 py-2.5">ไฟล์ / ลิงก์</th>
                          <th className="px-3.5 py-2.5">ใบเสร็จ</th>
                          <th className="px-3.5 py-2.5">คะแนน</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-purple-100">
                        {filteredSubmissions.map((sub) => (
                          <tr key={sub.id} className="hover:bg-purple-50/50">
                            <td className="px-3.5 py-3 font-['Fredoka',sans-serif] text-purple-700">{sub.studentNo}</td>
                            <td className="px-3.5 py-3 font-['Fredoka',sans-serif] font-bold text-purple-950">{sub.studentId}</td>
                            <td className="px-3.5 py-3 font-medium text-slate-800">{sub.studentName}</td>
                            <td className="px-3.5 py-3 text-purple-700">{sub.sec}</td>
                            <td className="px-3.5 py-3 font-['Fredoka',sans-serif] text-slate-600">
                              {new Date(sub.submittedAt).toLocaleTimeString('th-TH')}
                            </td>
                            <td className="px-3.5 py-3">
                              <select
                                value={sub.status}
                                onChange={(e) =>
                                  handleOverrideStatus(sub.id, e.target.value as SubmissionStatus)
                                }
                                className="text-xs font-semibold px-2 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-900 cursor-pointer"
                              >
                                <option value="on_time">ส่งตรงเวลา</option>
                                <option value="late">ส่งช้า</option>
                                <option value="missing">ไม่ส่ง</option>
                                <option value="personal_leave">ลากิจ</option>
                                <option value="sick_leave">ลาป่วย</option>
                              </select>
                            </td>
                            <td className="px-3.5 py-3 text-[11px]">
                              {sub.fileUrl ? (
                                <a
                                  href={sub.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-purple-600 underline font-semibold truncate max-w-[130px] block"
                                >
                                  {sub.fileName || 'เปิดไฟล์'}
                                </a>
                              ) : sub.workLink ? (
                                <a
                                  href={sub.workLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-purple-600 underline font-semibold"
                                >
                                  เปิดลิงก์
                                </a>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-3.5 py-3 font-['Fredoka',sans-serif] text-purple-600 text-[11px]">
                              {sub.receiptId}
                            </td>
                            <td className="px-3.5 py-3">
                              <input
                                type="number"
                                defaultValue={sub.score ?? ''}
                                onBlur={(e) => {
                                  const val = e.target.value === '' ? null : Number(e.target.value);
                                  handleOverrideStatus(sub.id, sub.status, sub.feedback, val);
                                }}
                                className="w-14 px-2 py-1 text-center bg-purple-50 border border-purple-200 rounded-full text-xs font-['Fredoka',sans-serif] text-purple-950"
                              />
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
          <div className="max-w-3xl mx-auto bg-white/95 rounded-[32px] border-2 border-purple-200/90 p-7 sm:p-9 space-y-6 shadow-pillow">
            <div>
              <div className="inline-flex p-3.5 rounded-2xl bg-purple-100 text-purple-600 border border-purple-200 mb-3 shadow-2xs">
                <HardDrive className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-['Fredoka',sans-serif] font-bold text-purple-950">
                วิธีเก็บไฟล์งานใน Google Drive ด้วย Google Apps Script
              </h2>
              <p className="text-xs sm:text-sm text-purple-700/80 mt-1">
                ฟรี 100% ภายใต้ Firebase Spark Plan โดยไม่ต้องอัปเกรดเป็น Blaze Plan
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-[#F5F3FF] border border-purple-200 space-y-3 text-xs text-purple-900">
                <span className="font-bold text-sm block">ขั้นตอนการติดตั้ง (ใช้เวลา 2 นาที):</span>
                <ol className="list-decimal list-inside space-y-2 leading-relaxed">
                  <li>ไปที่ <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline font-semibold">script.google.com</a> แล้วกดปุ่ม "New project"</li>
                  <li>ลบโค้ดเดิมทั้งหมด แล้วคัดลอกโค้ดด้านล่างนี้ไปวาง</li>
                  <li>กด Deploy &rarr; New deployment &rarr; เลือกประเภท Web app</li>
                  <li>ตั้งค่า: Execute as "Me", Who has access: "Anyone"</li>
                  <li>กด Deploy และให้สิทธิ์เข้าถึง นำ URL มากรอกในระบบได้เลย!</li>
                </ol>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-purple-900">โค้ด Google Apps Script:</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(GAS_TEMPLATE_CODE);
                      setCopiedGasCode(true);
                      setTimeout(() => setCopiedGasCode(false), 2000);
                    }}
                    className="btn-cute inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-white bg-gradient-to-r from-purple-400 to-fuchsia-400 shadow-pillow-sm cursor-pointer"
                  >
                    {copiedGasCode ? <Check className="w-3.5 h-3.5 text-emerald-200" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedGasCode ? 'คัดลอกโค้ดแล้ว!' : 'คัดลอกโค้ด'}</span>
                  </button>
                </div>
                <pre className="p-5 rounded-2xl bg-purple-950 text-purple-200 font-mono text-[11px] overflow-x-auto max-h-80 border border-purple-900 leading-relaxed">
                  {GAS_TEMPLATE_CODE}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: New Course */}
      {showNewCourseModal && (
        <div className="fixed inset-0 z-50 bg-purple-950/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-purple-200 rounded-[28px] max-w-md w-full p-6 shadow-pillow space-y-4">
            <h3 className="text-lg font-bold text-purple-950">เพิ่มรายวิชาใหม่</h3>
            <form onSubmit={handleCreateCourse} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-purple-900 mb-1">รหัสวิชา</label>
                <input
                  type="text"
                  required
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value.toUpperCase())}
                  placeholder="เช่น CS101"
                  className="w-full px-4 py-2 bg-purple-50/60 border border-purple-200 rounded-full text-xs text-purple-950 uppercase focus:border-purple-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-purple-900 mb-1">ชื่อวิชา</label>
                <input
                  type="text"
                  required
                  value={newCourseTitle}
                  onChange={(e) => setNewCourseTitle(e.target.value)}
                  placeholder="เช่น การพัฒนาเว็บแอปพลิเคชัน"
                  className="w-full px-4 py-2 bg-purple-50/60 border border-purple-200 rounded-full text-xs text-purple-950 focus:border-purple-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-purple-900 mb-1">กลุ่มเรียน (คั่นด้วยจุลภาค)</label>
                <input
                  type="text"
                  value={newCourseSecs}
                  onChange={(e) => setNewCourseSecs(e.target.value)}
                  placeholder="Sec 1, Sec 2"
                  className="w-full px-4 py-2 bg-purple-50/60 border border-purple-200 rounded-full text-xs text-purple-950 focus:border-purple-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewCourseModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-purple-600 hover:text-purple-900"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="btn-cute px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-400 to-fuchsia-400 rounded-full shadow-pillow-sm"
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
        <div className="fixed inset-0 z-50 bg-purple-950/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-purple-200 rounded-[28px] max-w-sm w-full p-6 shadow-pillow space-y-4">
            <h3 className="text-lg font-bold text-purple-950">ขยายเวลาส่งงาน</h3>
            <p className="text-xs text-purple-700/80">
              {extendModalAssignment.courseCode}: {extendModalAssignment.title}
            </p>
            <div>
              <label className="block text-xs font-semibold text-purple-900 mb-1">กำหนดส่งใหม่</label>
              <input
                type="datetime-local"
                value={extendDatetime}
                onChange={(e) => setExtendDatetime(e.target.value)}
                className="w-full px-4 py-2 bg-purple-50/60 border border-purple-200 rounded-full text-xs text-purple-950 focus:border-purple-400"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setExtendModalAssignment(null)}
                className="px-4 py-1.5 text-xs text-purple-600 hover:text-purple-900"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleExtendDeadline}
                className="btn-cute px-5 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-purple-400 to-fuchsia-400 rounded-full shadow-pillow-sm"
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
