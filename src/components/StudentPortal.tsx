import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Heart,
  Link as LinkIcon,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  ShieldAlert,
  Smile,
  Sparkles,
  Star,
  UploadCloud
} from 'lucide-react';
import { Assignment, RosterLookup, Submission } from '../types';
import { getAssignmentByCode } from '../services/assignmentService';
import { lookupStudent, submitStudentWork, getStudentSubmission } from '../services/submissionService';
import { uploadFileToGoogleDriveViaGAS } from '../services/gasService';

interface StudentPortalProps {
  initialCode?: string;
  onNavigateToTeacher?: () => void;
}

export const StudentPortal: React.FC<StudentPortalProps> = ({
  initialCode = '',
  onNavigateToTeacher
}) => {
  // Step flow: 1 = Assignment Code, 2 = Student ID Verification, 3 = Work Upload/Link, 4 = Receipt
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Assignment State
  const [assignmentCode, setAssignmentCode] = useState(initialCode.toUpperCase());
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Step 2: Student ID State
  const [studentIdInput, setStudentIdInput] = useState('');
  const [verifiedStudent, setVerifiedStudent] = useState<RosterLookup | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [previousSubmission, setPreviousSubmission] = useState<Submission | null>(null);

  // Step 3: Submission Work State
  const [submissionType, setSubmissionType] = useState<'file' | 'link'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [workLink, setWorkLink] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 4: Receipt State
  const [receipt, setReceipt] = useState<Submission | null>(null);
  const [copiedReceipt, setCopiedReceipt] = useState(false);

  // Handle URL parameter on load: always ensure Step 1 is default unless ?code= is explicitly provided
  useEffect(() => {
    // Clear any potential leftover student session data
    sessionStorage.removeItem('classwork_state');
    sessionStorage.removeItem('classwork_step');

    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    if (codeParam && codeParam.trim().length >= 4) {
      setAssignmentCode(codeParam.trim().toUpperCase());
      handleLookupAssignment(codeParam.trim().toUpperCase());
    } else {
      setStep(1);
      setAssignment(null);
      setVerifiedStudent(null);
    }
  }, []);

  // Step 1: Lookup Assignment
  const handleLookupAssignment = async (codeToSearch?: string) => {
    const code = (codeToSearch || assignmentCode).trim().toUpperCase();
    if (!code) {
      setCodeError('กรุณากรอกรหัสงาน 6 หลักนะ');
      return;
    }
    setCodeLoading(true);
    setCodeError(null);

    try {
      const found = await getAssignmentByCode(code);
      if (!found) {
        setCodeError('ไม่พบรหัสงานนี้ในระบบ ลองตรวจสอบรหัส 6 หลักกับคุณครูผู้สอนอีกครั้งนะ');
        setAssignment(null);
        return;
      }

      setAssignment(found);

      // Check default submission type based on acceptedTypes
      const hasFileTypes = found.acceptedTypes.some(
        (t) => t === 'pdf' || t === 'doc' || t === 'image'
      );
      if (hasFileTypes) {
        setSubmissionType('file');
      } else if (found.acceptedTypes.includes('link')) {
        setSubmissionType('link');
      }

      // Automatically move to step 2
      setStep(2);
    } catch (err: any) {
      console.error(err);
      setCodeError(err.message || 'เกิดข้อผิดพลาดในการตรวจสอบรหัสงาน');
    } finally {
      setCodeLoading(false);
    }
  };

  // Step 2: Verify Student ID
  const handleVerifyStudent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!assignment) return;

    const rawId = studentIdInput.trim();
    if (!rawId) {
      setStudentError('กรุณากรอกรหัสนักศึกษาด้วยนะ');
      return;
    }

    setStudentLoading(true);
    setStudentError(null);

    try {
      const student = await lookupStudent(assignment.courseId, rawId);
      if (!student) {
        setStudentError(
          `ไม่พบรหัสนักศึกษา "${rawId}" ในรายวิชา ${assignment.courseCode} (${assignment.courseTitle}) ลองตรวจสอบรหัสหรือแจ้งคุณครูผู้สอนให้เพิ่มรายชื่อนะ`
        );
        setVerifiedStudent(null);
        return;
      }

      // Check section match if assignment restricted to specific section
      if (assignment.sec !== 'ALL' && student.sec !== assignment.sec) {
        setStudentError(
          `รหัสนี้สังกัด ${student.sec} แต่งานนี้เปิดรับเฉพาะกลุ่ม ${assignment.sec} เท่านั้นจ้า`
        );
        setVerifiedStudent(null);
        return;
      }

      setVerifiedStudent(student);

      // Check if student already submitted
      const existing = await getStudentSubmission(assignment.id, student.studentId);
      if (existing) {
        setPreviousSubmission(existing);
      } else {
        setPreviousSubmission(null);
      }

      // Proceed to Step 3
      setStep(3);
    } catch (err: any) {
      console.error(err);
      setStudentError(err.message || 'เกิดข้อผิดพลาดในการตรวจสอบรหัสนักศึกษา');
    } finally {
      setStudentLoading(false);
    }
  };

  // Step 3: Handle File selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const maxBytes = (assignment?.maxFileSizeMB || 10) * 1024 * 1024;
      if (file.size > maxBytes) {
        setSubmitError(`ไฟล์ใหญ่เกินไปนะ (ขนาดสูงสุดไม่เกิน ${assignment?.maxFileSizeMB || 10} MB)`);
        setSelectedFile(null);
        return;
      }
      setSubmitError(null);
      setSelectedFile(file);
    }
  };

  // Step 3: Submit Work
  const handleSubmitWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignment || !verifiedStudent) return;

    setSubmitError(null);

    if (submissionType === 'file' && !selectedFile) {
      setSubmitError('กรุณาเลือกไฟล์งานที่จะส่งด้วยนะ');
      return;
    }

    if (submissionType === 'link' && !workLink.trim()) {
      setSubmitError('กรุณาวางลิงก์ผลงาน เช่น Google Docs, Canva หรือ Figma');
      return;
    }

    setSubmitting(true);
    setUploadProgressMsg('กำลังเตรียมความพร้อมในการส่งงาน...');

    try {
      let finalFileUrl = '';
      let finalFileName = '';
      let finalFileSize = 0;

      // If uploading file:
      if (submissionType === 'file' && selectedFile) {
        finalFileName = selectedFile.name;
        finalFileSize = selectedFile.size;

        if (assignment.gasWebAppUrl) {
          setUploadProgressMsg('กำลังบันทึกไฟล์ลง Google Drive ให้คุณครู...');
          const gasRes = await uploadFileToGoogleDriveViaGAS(
            selectedFile,
            assignment.gasWebAppUrl,
            {
              studentId: verifiedStudent.studentId,
              studentName: verifiedStudent.fullName,
              assignmentCode: assignment.code,
              courseCode: assignment.courseCode
            }
          );
          finalFileUrl = gasRes.fileUrl;
        } else {
          setUploadProgressMsg('กำลังบันทึกข้อมูลการส่งงาน...');
          finalFileUrl = `[ไฟล์แนบ]: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`;
        }
      }

      setUploadProgressMsg('กำลังสร้างใบเสร็จรับงานน่ารักๆ...');
      const submitted = await submitStudentWork({
        assignment,
        student: verifiedStudent,
        submissionType,
        fileUrl: finalFileUrl,
        fileName: finalFileName,
        fileSize: finalFileSize,
        workLink: workLink.trim(),
      });

      setReceipt(submitted);
      setStep(4);
    } catch (err: any) {
      console.error(err);
      setSubmitError(err.message || 'เกิดข้อผิดพลาดในการส่งงาน');
    } finally {
      setSubmitting(false);
      setUploadProgressMsg('');
    }
  };

  const handleCopyReceipt = () => {
    if (!receipt) return;
    const textToCopy = `✨ [ใบรับงาน ClassWork]\nรหัสอ้างอิง: ${receipt.receiptId}\nงาน: ${assignment?.title}\nวิชา: ${assignment?.courseCode}\nรหัสนักศึกษา: ${receipt.studentId}\nชื่อ-นามสกุล: ${receipt.studentName}\nกลุ่ม: ${receipt.sec} (เลขที่ ${receipt.studentNo})\nเวลาที่ส่ง: ${new Date(receipt.submittedAt).toLocaleString('th-TH')}\nสถานะ: ${receipt.status === 'on_time' ? 'ส่งตรงเวลา' : 'ส่งช้า'}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedReceipt(true);
    setTimeout(() => setCopiedReceipt(false), 2500);
  };

  const resetAll = () => {
    setStep(1);
    setAssignmentCode('');
    setAssignment(null);
    setVerifiedStudent(null);
    setStudentIdInput('');
    setSelectedFile(null);
    setWorkLink('');
    setReceipt(null);
    setCodeError(null);
    setStudentError(null);
    setSubmitError(null);
  };

  const isPastClose = assignment ? new Date() > new Date(assignment.closeAt) : false;
  const isBeforeOpen = assignment ? new Date() < new Date(assignment.openAt) : false;

  return (
    <div className="min-h-[calc(100vh-4rem)] cute-confetti-bg relative py-8 px-4 sm:px-6 overflow-hidden">
      {/* Cute Floating Decorative Doodles in Background */}
      <div className="absolute top-12 left-8 text-purple-200 pointer-events-none select-none hidden lg:block animate-pulse">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l2.4 5.3 5.8.8-4.2 4.1 1 5.8-5-2.6-5 2.6 1-5.8-4.2-4.1 5.8-.8z" />
        </svg>
      </div>
      <div className="absolute top-36 right-10 text-pink-200 pointer-events-none select-none hidden lg:block animate-bounce">
        <Heart className="w-8 h-8 fill-pink-200 text-pink-300" />
      </div>
      <div className="absolute bottom-20 left-12 text-yellow-200 pointer-events-none select-none hidden lg:block">
        <Star className="w-10 h-10 fill-yellow-200 text-yellow-300" />
      </div>
      <div className="absolute bottom-32 right-16 text-sky-200 pointer-events-none select-none hidden lg:block animate-pulse">
        <Sparkles className="w-9 h-9 text-sky-300" />
      </div>

      <div className="max-w-xl mx-auto relative z-10">
        {/* Cute Doodle Stepper (1-4) with smileys */}
        <div className="mb-7">
          <div className="flex items-center justify-between px-3 text-xs sm:text-sm font-medium">
            {/* Step 1 */}
            <div
              className={`flex items-center gap-1.5 transition-colors ${
                step >= 1 ? 'text-purple-700 font-bold' : 'text-purple-300'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-['Fredoka',sans-serif] ${
                  step >= 1
                    ? 'bg-purple-500 text-white shadow-pillow-sm'
                    : 'bg-purple-100 text-purple-400'
                }`}
              >
                1
              </div>
              <span className="hidden sm:inline">รหัสงาน</span>
            </div>

            <div className={`h-1 flex-1 mx-2 rounded-full ${step >= 2 ? 'bg-purple-400' : 'bg-purple-100'}`} />

            {/* Step 2 */}
            <div
              className={`flex items-center gap-1.5 transition-colors ${
                step >= 2 ? 'text-purple-700 font-bold' : 'text-purple-300'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-['Fredoka',sans-serif] ${
                  step >= 2
                    ? 'bg-purple-500 text-white shadow-pillow-sm'
                    : 'bg-purple-100 text-purple-400'
                }`}
              >
                2
              </div>
              <span className="hidden sm:inline">ตรวจชื่อ</span>
            </div>

            <div className={`h-1 flex-1 mx-2 rounded-full ${step >= 3 ? 'bg-purple-400' : 'bg-purple-100'}`} />

            {/* Step 3 */}
            <div
              className={`flex items-center gap-1.5 transition-colors ${
                step >= 3 ? 'text-purple-700 font-bold' : 'text-purple-300'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-['Fredoka',sans-serif] ${
                  step >= 3
                    ? 'bg-purple-500 text-white shadow-pillow-sm'
                    : 'bg-purple-100 text-purple-400'
                }`}
              >
                3
              </div>
              <span className="hidden sm:inline">ส่งงาน</span>
            </div>

            <div className={`h-1 flex-1 mx-2 rounded-full ${step >= 4 ? 'bg-purple-400' : 'bg-purple-100'}`} />

            {/* Step 4 */}
            <div
              className={`flex items-center gap-1.5 transition-colors ${
                step >= 4 ? 'text-pink-600 font-bold' : 'text-purple-300'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-['Fredoka',sans-serif] ${
                  step >= 4
                    ? 'bg-pink-400 text-white shadow-pillow-sm'
                    : 'bg-purple-100 text-purple-400'
                }`}
              >
                4
              </div>
              <span className="hidden sm:inline">ใบเสร็จ</span>
            </div>
          </div>
        </div>

        {/* ================= STEP 1: ASSIGNMENT CODE ================= */}
        {step === 1 && (
          <div className="bg-white/95 backdrop-blur-md rounded-[32px] border-2 border-purple-200/80 p-7 sm:p-9 shadow-pillow relative overflow-hidden transition-all">
            {/* Cute Mascot Smiley Star on Top */}
            <div className="flex flex-col items-center text-center mb-7">
              <div className="relative mb-3.5 group">
                {/* Cheerful Pastel Smiling Star Mascot */}
                <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-[28px] bg-gradient-to-tr from-purple-200 via-pink-100 to-amber-100 border-2 border-purple-300 flex items-center justify-center shadow-pillow-sm transform group-hover:scale-105 transition-transform duration-300">
                  <svg className="w-12 h-12 text-purple-500 drop-shadow-sm" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l2.4 5.3 5.8.8-4.2 4.1 1 5.8-5-2.6-5 2.6 1-5.8-4.2-4.1 5.8-.8z" />
                    {/* Cute cartoon eyes & blushing cheeks */}
                    <circle cx="9.5" cy="10" r="1.1" fill="#4C1D95" />
                    <circle cx="14.5" cy="10" r="1.1" fill="#4C1D95" />
                    <circle cx="7.8" cy="12.2" r="1.3" fill="#F472B6" opacity="0.6" />
                    <circle cx="16.2" cy="12.2" r="1.3" fill="#F472B6" opacity="0.6" />
                    <path d="M10 13.5a2.2 2.2 0 0 0 4 0" stroke="#4C1D95" strokeWidth="1.3" strokeLinecap="round" fill="none" />
                  </svg>
                </div>
                <div className="absolute -bottom-1 -right-1 bg-yellow-200 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-yellow-300 shadow-2xs">
                  สวัสดีจ้า!
                </div>
              </div>

              <h1 className="text-2xl sm:text-3xl font-['Fredoka',sans-serif] font-bold text-purple-950 tracking-tight">
                ส่งงานในชั้นเรียน
              </h1>
              <p className="text-xs sm:text-sm text-purple-700/80 mt-1 max-w-sm">
                กรอกรหัสงาน 6 หลักที่คุณครูแจก เพื่อเริ่มส่งงานได้เลย
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLookupAssignment();
              }}
              className="space-y-5"
            >
              <div>
                <label className="block text-sm sm:text-base font-semibold text-purple-950 mb-2.5 text-center">
                  รหัสงาน 6 หลัก (Assignment Code)
                </label>

                {/* Extra Rounded Pillow Input */}
                <div className="relative">
                  <input
                    type="text"
                    maxLength={8}
                    value={assignmentCode}
                    onChange={(e) => {
                      setAssignmentCode(e.target.value.toUpperCase());
                      setCodeError(null);
                    }}
                    placeholder="เช่น K7M2P9"
                    autoFocus
                    className="w-full text-center tracking-[0.25em] font-['Fredoka',sans-serif] text-2xl sm:text-3xl font-bold py-4 px-6 bg-purple-50/70 text-purple-950 border-2 border-purple-200 rounded-full focus:bg-white focus:border-purple-400 focus:ring-4 focus:ring-purple-200/60 focus:outline-hidden transition-all uppercase placeholder:normal-case placeholder:tracking-normal placeholder:font-['Itim',sans-serif] placeholder:text-purple-300 placeholder:text-lg shadow-inner"
                  />
                </div>

                {codeError && (
                  <div className="mt-3.5 p-3.5 rounded-2xl bg-pink-50 border border-pink-200 text-pink-700 text-xs flex items-start gap-2.5 shadow-2xs">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-pink-500" />
                    <span>{codeError}</span>
                  </div>
                )}
              </div>

              {/* Extra Rounded Pillow Button with Bouncy Cute Effect */}
              <button
                type="submit"
                disabled={codeLoading || assignmentCode.trim().length === 0}
                className="w-full btn-cute flex items-center justify-center gap-2 py-4 px-6 rounded-full font-bold text-base text-white bg-gradient-to-r from-purple-400 via-purple-500 to-fuchsia-400 hover:from-purple-500 hover:to-fuchsia-500 shadow-pillow-sm disabled:opacity-40 disabled:shadow-none cursor-pointer tracking-wide"
              >
                {codeLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>กำลังค้นหางาน...</span>
                  </>
                ) : (
                  <>
                    <span>ค้นหางาน</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ================= STEP 2: STUDENT ID VERIFICATION ================= */}
        {step === 2 && assignment && (
          <div className="bg-white/95 backdrop-blur-md rounded-[32px] border-2 border-purple-200/80 p-7 sm:p-9 shadow-pillow relative overflow-hidden transition-all">
            {/* Cute Assignment Details Card (Soft Lavender) */}
            <div className="mb-6 p-5 rounded-[24px] bg-[#F5F3FF] border border-purple-200/90 shadow-2xs">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-['Fredoka',sans-serif] font-bold text-purple-700 bg-white px-3 py-1 rounded-full border border-purple-200 shadow-2xs">
                  {assignment.courseCode}
                </span>
                <span className="font-['Fredoka',sans-serif] font-bold text-purple-600 bg-purple-100/70 px-2.5 py-0.5 rounded-full">
                  รหัส: {assignment.code}
                </span>
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-purple-950 mt-1">
                {assignment.title}
              </h2>
              {assignment.description && (
                <p className="text-xs sm:text-sm text-purple-800/80 mt-1.5 line-clamp-2">
                  {assignment.description}
                </p>
              )}

              {/* Deadline & Status Pill */}
              <div className="mt-3.5 pt-3 border-t border-purple-200/70 flex flex-wrap items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-1.5 text-purple-700 font-medium">
                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                  <span>กำหนดส่ง: {new Date(assignment.closeAt).toLocaleString('th-TH')}</span>
                </div>
                {isPastClose ? (
                  assignment.allowLate ? (
                    <span className="px-3 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-medium">
                      เลยกำหนด (ส่งช้าได้จ้า)
                    </span>
                  ) : (
                    <span className="px-3 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 font-medium">
                      ปิดรับงานแล้ว
                    </span>
                  )
                ) : isBeforeOpen ? (
                  <span className="px-3 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                    ยังไม่ถึงเวลาเปิดรับ
                  </span>
                ) : (
                  <span className="px-3 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-medium">
                    ✨ เปิดรับงานปกติ
                  </span>
                )}
              </div>

              {/* Worksheet Download Button (if provided by teacher) */}
              {assignment.worksheetUrl && (
                <div className="mt-3.5 pt-3 border-t border-purple-200/60">
                  <a
                    href={assignment.worksheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold text-purple-700 bg-white border border-purple-300 hover:bg-purple-50 shadow-2xs transition-all"
                  >
                    <Download className="w-4 h-4 text-purple-500" />
                    <span>ดาวน์โหลดใบงาน: {assignment.worksheetName || 'เอกสารประกอบ'}</span>
                  </a>
                </div>
              )}
            </div>

            {/* Verification Form */}
            <form onSubmit={handleVerifyStudent} className="space-y-4">
              <div>
                <label className="block text-sm sm:text-base font-semibold text-purple-950 mb-2.5 text-center">
                  กรอกรหัสนักศึกษา เพื่อยืนยันตัวตน
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={studentIdInput}
                    onChange={(e) => {
                      setStudentIdInput(e.target.value);
                      setStudentError(null);
                    }}
                    placeholder="เช่น 1650701234"
                    autoFocus
                    className="w-full text-center tracking-widest font-['Fredoka',sans-serif] text-2xl sm:text-3xl font-bold py-4 px-6 bg-purple-50/70 text-purple-950 border-2 border-purple-200 rounded-full focus:bg-white focus:border-purple-400 focus:ring-4 focus:ring-purple-200/60 focus:outline-hidden transition-all shadow-inner placeholder:text-purple-300 placeholder:text-lg placeholder:tracking-normal placeholder:font-['Itim',sans-serif]"
                  />
                </div>
                <p className="text-xs sm:text-sm text-purple-700/80 mt-2 text-center">
                  ระบบจะดึงเลขที่ ชื่อ-นามสกุล และกลุ่มเรียนมาแสดงให้ตรวจสอบความถูกต้องจ้า
                </p>

                {studentError && (
                  <div className="mt-3.5 p-3.5 rounded-2xl bg-pink-50 border border-pink-200 text-pink-700 text-xs flex items-start gap-2.5 shadow-2xs">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-pink-500" />
                    <span>{studentError}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-5 py-3.5 rounded-full text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="submit"
                  disabled={studentLoading || studentIdInput.trim().length === 0}
                  className="flex-1 btn-cute flex items-center justify-center gap-2 py-3.5 px-6 rounded-full font-bold text-white bg-gradient-to-r from-purple-400 via-purple-500 to-fuchsia-400 hover:from-purple-500 hover:to-fuchsia-500 shadow-pillow-sm disabled:opacity-40 cursor-pointer"
                >
                  {studentLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>กำลังตรวจสอบข้อมูล...</span>
                    </>
                  ) : (
                    <>
                      <span>ยืนยันรหัสของฉัน</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ================= STEP 3: WORK SUBMISSION ================= */}
        {step === 3 && assignment && verifiedStudent && (
          <div className="bg-white/95 backdrop-blur-md rounded-[32px] border-2 border-purple-200/80 p-7 sm:p-9 shadow-pillow relative overflow-hidden transition-all">
            {/* Cute Verified Identity Card (Mint/Pastel Green) */}
            <div className="mb-6 p-5 rounded-[24px] bg-emerald-50/80 border-2 border-emerald-200 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>ข้อมูลถูกต้อง ยืนยันตัวตนสำเร็จ!</span>
                </span>
                <span className="text-xs font-semibold px-3 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                  {verifiedStudent.sec}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700 pt-1">
                <div>
                  <span className="text-emerald-700/70">เลขที่:</span>{' '}
                  <strong className="text-slate-900 font-['Fredoka',sans-serif] text-sm">
                    {verifiedStudent.studentNo}
                  </strong>
                </div>
                <div>
                  <span className="text-emerald-700/70">รหัส:</span>{' '}
                  <strong className="font-['Fredoka',sans-serif] text-purple-900 text-sm">
                    {verifiedStudent.studentId}
                  </strong>
                </div>
                <div className="col-span-2 pt-1 border-t border-emerald-200/60">
                  <span className="text-emerald-700/70">ชื่อ-นามสกุล:</span>{' '}
                  <strong className="text-slate-900">{verifiedStudent.fullName}</strong>
                </div>
              </div>

              {previousSubmission && (
                <div className="mt-3 pt-2.5 border-t border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
                  <span>เคยส่งงานแล้วเมื่อ {new Date(previousSubmission.submittedAt).toLocaleTimeString('th-TH')}</span>
                  {assignment.allowResubmit && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-white px-2.5 py-0.5 rounded-full border border-emerald-200">
                      ส่งใหม่ได้จ้า (ใช้ไฟล์ล่าสุด)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Submission Form */}
            <form onSubmit={handleSubmitWork} className="space-y-5">
              {/* Submission Type Switcher (Cute Pillow Toggle) */}
              <div className="flex items-center bg-purple-100/70 p-1 rounded-full">
                <button
                  type="button"
                  onClick={() => setSubmissionType('file')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-xs font-semibold transition-all ${
                    submissionType === 'file'
                      ? 'bg-white text-purple-900 shadow-2xs font-bold'
                      : 'text-purple-600 hover:text-purple-900'
                  }`}
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>แนบไฟล์ (ไม่เกิน {assignment.maxFileSizeMB || 10} MB)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubmissionType('link')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-xs font-semibold transition-all ${
                    submissionType === 'link'
                      ? 'bg-white text-purple-900 shadow-2xs font-bold'
                      : 'text-purple-600 hover:text-purple-900'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>วางลิงก์ผลงาน</span>
                </button>
              </div>

              {/* File Upload Dropzone */}
              {submissionType === 'file' ? (
                <div>
                  <label className="block text-sm sm:text-base font-semibold text-purple-950 mb-2">
                    เลือกไฟล์งานของคุณ (PDF, Word, รูปภาพ)
                  </label>
                  <div className="relative border-2 border-dashed border-purple-300 hover:border-purple-400 rounded-[24px] p-7 text-center bg-purple-50/40 hover:bg-purple-50/70 transition-all cursor-pointer group">
                    <input
                      type="file"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex flex-col items-center justify-center gap-2 pointer-events-none">
                      <div className="w-13 h-13 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                        <UploadCloud className="w-7 h-7" />
                      </div>
                      {selectedFile ? (
                        <div>
                          <p className="text-base font-bold text-purple-950 break-all">{selectedFile.name}</p>
                          <p className="text-sm text-purple-700 mt-1 font-['Fredoka',sans-serif]">
                            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • แตะเพื่อเปลี่ยนไฟล์
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-base font-semibold text-purple-950">แตะเพื่อเลือกไฟล์จากเครื่อง</p>
                          <p className="text-xs sm:text-sm text-purple-600/80 mt-1">
                            ขนาดสูงสุด {assignment.maxFileSizeMB || 10} MB
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Link Input Area */
                <div>
                  <label className="block text-sm sm:text-base font-semibold text-purple-950 mb-2">
                    ลิงก์ผลงาน (URL)
                  </label>
                  <input
                    type="url"
                    value={workLink}
                    onChange={(e) => setWorkLink(e.target.value)}
                    placeholder="https://docs.google.com/... หรือ Canva, Figma"
                    className="w-full px-5 py-3.5 bg-purple-50/60 text-purple-950 border-2 border-purple-200 rounded-full text-sm sm:text-base focus:bg-white focus:border-purple-400 focus:ring-4 focus:ring-purple-200/60 focus:outline-hidden transition-all shadow-inner"
                  />
                  <p className="text-xs sm:text-sm text-purple-700/80 mt-1.5 px-3">
                    *อย่าลืมเปิดสิทธิ์ให้ทุกคนที่มีลิงก์สามารถดูได้นะ (Anyone with link can view)
                  </p>
                </div>
              )}

              {/* Error Alert */}
              {submitError && (
                <div className="p-3.5 rounded-2xl bg-pink-50 border border-pink-200 text-pink-700 text-xs flex items-start gap-2.5 shadow-2xs">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-pink-500" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                  className="px-5 py-3.5 rounded-full text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 btn-cute flex items-center justify-center gap-2 py-3.5 px-6 rounded-full font-bold text-white bg-gradient-to-r from-purple-400 via-purple-500 to-fuchsia-400 hover:from-purple-500 hover:to-fuchsia-500 shadow-pillow-sm disabled:opacity-40 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{uploadProgressMsg || 'กำลังส่งงาน...'}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>ส่งงานเลย!</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ================= STEP 4: RECEIPT (SUCCESS) ================= */}
        {step === 4 && receipt && (
          <div className="bg-white/95 backdrop-blur-md rounded-[32px] border-2 border-purple-200/80 p-7 sm:p-9 text-center shadow-pillow relative overflow-hidden transition-all animate-in fade-in zoom-in-95 duration-200">
            {/* Cute Cheerful Success Badge */}
            <div className="w-18 h-18 rounded-full bg-emerald-100 border-2 border-emerald-300 text-emerald-600 flex items-center justify-center mx-auto mb-4 shadow-soft-mint animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <h2 className="text-2xl font-['Fredoka',sans-serif] font-bold text-purple-950">
              เย้! ส่งงานสำเร็จแล้ว 🎉
            </h2>
            <p className="text-xs sm:text-sm text-purple-700/80 mt-1">
              ระบบบันทึกงานของคุณครูเรียบร้อย บันทึกหรือแคปหน้าจอนี้เก็บไว้เป็นหลักฐานได้เลยนะ
            </p>

            {/* Cute Pastel Receipt Card */}
            <div className="mt-6 p-5 rounded-[24px] bg-[#F5F3FF] border-2 border-dashed border-purple-300 text-left space-y-3.5 relative">
              <div className="flex items-center justify-between pb-3 border-b border-purple-200">
                <span className="text-xs text-purple-700/70 font-semibold">หมายเลขอ้างอิง (Receipt ID)</span>
                <span className="font-['Fredoka',sans-serif] text-sm font-bold text-purple-900 bg-white px-3 py-0.5 rounded-full border border-purple-200">
                  {receipt.receiptId}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                <div>
                  <span className="text-purple-600/80">สถานะ:</span>{' '}
                  {receipt.status === 'on_time' ? (
                    <span className="font-bold text-emerald-700 bg-emerald-100 px-3 py-0.5 rounded-full border border-emerald-200">
                      ✨ ส่งตรงเวลา
                    </span>
                  ) : (
                    <span className="font-bold text-amber-700 bg-amber-100 px-3 py-0.5 rounded-full border border-amber-200">
                      ส่งช้า
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-purple-600/80">เวลาที่ส่ง:</span>{' '}
                  <strong className="text-purple-950 font-['Fredoka',sans-serif]">
                    {new Date(receipt.submittedAt).toLocaleTimeString('th-TH')}
                  </strong>
                </div>
                <div>
                  <span className="text-purple-600/80">รหัสนักศึกษา:</span>{' '}
                  <strong className="font-['Fredoka',sans-serif] text-purple-950 text-sm">{receipt.studentId}</strong>
                </div>
                <div>
                  <span className="text-purple-600/80">กลุ่มเรียน:</span>{' '}
                  <strong className="text-purple-950">{receipt.sec} (เลขที่ {receipt.studentNo})</strong>
                </div>
                <div className="col-span-2 pt-1 border-t border-purple-200/60">
                  <span className="text-purple-600/80">ชื่อ-นามสกุล:</span>{' '}
                  <strong className="text-purple-950 text-sm sm:text-base">{receipt.studentName}</strong>
                </div>
                <div className="col-span-2">
                  <span className="text-purple-600/80">งานที่ส่ง:</span>{' '}
                  <strong className="text-purple-950">
                    {assignment?.title} ({assignment?.courseCode})
                  </strong>
                </div>
                {receipt.fileName && (
                  <div className="col-span-2 text-purple-700 truncate text-xs">
                    ไฟล์: <span className="font-medium text-purple-900">{receipt.fileName}</span>
                  </div>
                )}
                {receipt.workLink && (
                  <div className="col-span-2 text-purple-700 truncate text-xs">
                    ลิงก์: <span className="font-medium text-purple-600 underline">{receipt.workLink}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleCopyReceipt}
                className="flex-1 btn-cute flex items-center justify-center gap-2 py-3.5 px-5 rounded-full text-xs font-bold text-purple-800 bg-purple-100 hover:bg-purple-200 border border-purple-200 transition-colors shadow-2xs cursor-pointer"
              >
                {copiedReceipt ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700">คัดลอกข้อมูลแล้ว!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-purple-600" />
                    <span>คัดลอกหลักฐานการส่ง</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={resetAll}
                className="flex-1 btn-cute flex items-center justify-center gap-2 py-3.5 px-5 rounded-full text-xs font-bold text-white bg-gradient-to-r from-purple-400 to-fuchsia-400 hover:from-purple-500 hover:to-fuchsia-500 shadow-pillow-sm cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>ส่งงานวิชาอื่น</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
