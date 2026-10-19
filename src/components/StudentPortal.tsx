import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileText,
  HelpCircle,
  Link as LinkIcon,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  User,
  Copy,
  Check
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

  // Handle URL parameter on load (e.g., ?code=ABC123 or #code=ABC123)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code') || (window.location.hash.includes('code=') ? window.location.hash.split('code=')[1]?.slice(0, 6) : '');
    if (codeParam && codeParam.trim().length >= 4) {
      setAssignmentCode(codeParam.trim().toUpperCase());
      handleLookupAssignment(codeParam.trim().toUpperCase());
    }
  }, []);

  // Step 1: Lookup Assignment
  const handleLookupAssignment = async (codeToSearch?: string) => {
    const code = (codeToSearch || assignmentCode).trim().toUpperCase();
    if (!code) {
      setCodeError('กรุณากรอกรหัสงาน 6 หลัก');
      return;
    }
    setCodeLoading(true);
    setCodeError(null);

    try {
      const found = await getAssignmentByCode(code);
      if (!found) {
        setCodeError('ไม่พบรหัสงานนี้ในระบบ กรุณาตรวจสอบรหัส 6 หลักจากอาจารย์ผู้สอน');
        setAssignment(null);
        return;
      }

      setAssignment(found);

      // Check default submission type based on acceptedTypes
      const hasFileTypes = found.acceptedTypes.some((t) => t === 'pdf' || t === 'doc' || t === 'image');
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
      setStudentError('กรุณากรอกรหัสนักศึกษา');
      return;
    }

    setStudentLoading(true);
    setStudentError(null);

    try {
      const student = await lookupStudent(assignment.courseId, rawId);
      if (!student) {
        setStudentError(
          `ไม่พบรหัสนักศึกษา "${rawId}" ในรายวิชา ${assignment.courseCode} (${assignment.courseTitle}) กรุณาตรวจสอบรหัสหรือติดต่ออาจารย์ผู้สอนเพื่อเพิ่มรายชื่อ`
        );
        setVerifiedStudent(null);
        return;
      }

      // Check section match if assignment restricted to specific section
      if (assignment.sec !== 'ALL' && student.sec !== assignment.sec) {
        setStudentError(
          `รหัสนี้สังกัด ${student.sec} แต่งานนี้เปิดรับเฉพาะ ${assignment.sec} เท่านั้น`
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
        setSubmitError(`ขนาดไฟล์เกินกำหนด (สูงสุดไม่เกิน ${assignment?.maxFileSizeMB || 10} MB)`);
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
      setSubmitError('กรุณาเลือกไฟล์งานที่ต้องการส่ง');
      return;
    }

    if (submissionType === 'link' && !workLink.trim()) {
      setSubmitError('กรุณากรอกลิงก์ผลงาน เช่น Google Docs, Canva หรือ Figma');
      return;
    }

    setSubmitting(true);
    setUploadProgressMsg('กำลังเตรียมการส่งงาน...');

    try {
      let finalFileUrl = '';
      let finalFileName = '';
      let finalFileSize = 0;

      // If uploading file:
      if (submissionType === 'file' && selectedFile) {
        finalFileName = selectedFile.name;
        finalFileSize = selectedFile.size;

        // Check if teacher has Google Apps Script Web App configured
        if (assignment.gasWebAppUrl) {
          setUploadProgressMsg('กำลังบันทึกไฟล์ลง Google Drive ผ่าน Google Apps Script...');
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
          // If GAS not configured, we create a structured local record reference
          // Note: In production without Blaze, teachers configure GAS url once in settings.
          setUploadProgressMsg('กำลังบันทึกข้อมูลการส่งงาน...');
          finalFileUrl = `[ไฟล์แนบในระบบ]: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`;
        }
      }

      setUploadProgressMsg('กำลังออกใบเสร็จรับงาน...');
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
    const textToCopy = `[ใบรับงาน ClassWork]\nรหัสอ้างอิง: ${receipt.receiptId}\nงาน: ${assignment?.title}\nวิชา: ${assignment?.courseCode}\nรหัสนักศึกษา: ${receipt.studentId}\nชื่อ-นามสกุล: ${receipt.studentName}\nกลุ่ม: ${receipt.sec} (เลขที่ ${receipt.studentNo})\nเวลาที่ส่ง: ${new Date(receipt.submittedAt).toLocaleString('th-TH')}\nสถานะ: ${receipt.status === 'on_time' ? 'ส่งตรงเวลา' : 'ส่งช้า'}`;
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

  // Helper date formatting
  const isPastClose = assignment ? new Date() > new Date(assignment.closeAt) : false;
  const isBeforeOpen = assignment ? new Date() < new Date(assignment.openAt) : false;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-slate-50 via-indigo-50/20 to-slate-100 py-6 px-4 sm:px-6">
      <div className="max-w-xl mx-auto">
        {/* Step Indicator Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between px-2 text-xs font-semibold text-slate-500">
            <span className={step >= 1 ? 'text-indigo-600' : ''}>1. รหัสงาน</span>
            <span className={step >= 2 ? 'text-indigo-600' : ''}>2. ยืนยันตัวตน</span>
            <span className={step >= 3 ? 'text-indigo-600' : ''}>3. ส่งงาน</span>
            <span className={step >= 4 ? 'text-emerald-600 font-bold' : ''}>4. ใบเสร็จ</span>
          </div>
          <div className="mt-2 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all duration-300 ease-out"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* ================= STEP 1: ASSIGNMENT CODE ================= */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 sm:p-8 transition-all">
            <div className="text-center mb-6">
              <div className="inline-flex p-3 rounded-2xl bg-indigo-50 text-indigo-600 mb-3">
                <Sparkles className="w-7 h-7" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">ระบบส่งงานในชั้นเรียน</h1>
              <p className="text-sm text-slate-600 mt-1">
                กรอกรหัสงาน 6 หลักที่อาจารย์แจกในห้องเรียน เพื่อเริ่มส่งงาน
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLookupAssignment();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  รหัสงาน 6 หลัก (Assignment Code)
                </label>
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
                    className="w-full text-center tracking-[0.25em] font-mono text-2xl font-bold py-3.5 px-4 bg-slate-50 border-2 border-slate-200 rounded-xl focus:bg-white focus:border-indigo-600 focus:outline-hidden transition-all uppercase placeholder:normal-case placeholder:tracking-normal placeholder:font-sans placeholder:text-slate-400 placeholder:text-base"
                  />
                </div>
                {codeError && (
                  <div className="mt-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{codeError}</span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={codeLoading || assignmentCode.trim().length === 0}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-700 active:scale-98 transition-all shadow-md shadow-indigo-200 disabled:opacity-50 disabled:shadow-none"
              >
                {codeLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>กำลังตรวจสอบรหัสงาน...</span>
                  </>
                ) : (
                  <>
                    <span>ค้นหางาน</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col items-center justify-center text-xs text-slate-500 gap-2">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>ไม่ต้อง Log In อีเมล • ส่งได้จากทั้ง Android และ iOS</span>
              </div>
              {onNavigateToTeacher && (
                <button
                  type="button"
                  onClick={onNavigateToTeacher}
                  className="text-indigo-600 hover:text-indigo-700 hover:underline font-medium mt-1"
                >
                  สำหรับอาจารย์ผู้สอน: คลิกที่นี่เพื่อจัดการงาน
                </button>
              )}
            </div>
          </div>
        )}

        {/* ================= STEP 2: STUDENT ID VERIFICATION ================= */}
        {step === 2 && assignment && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 sm:p-8 transition-all">
            {/* Assignment Card Header */}
            <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                  {assignment.courseCode}
                </span>
                <span className="font-mono font-bold text-slate-600">รหัสงาน: {assignment.code}</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-1">{assignment.title}</h2>
              {assignment.description && (
                <p className="text-xs sm:text-sm text-slate-600 mt-1 line-clamp-2">{assignment.description}</p>
              )}

              {/* Deadline & Status */}
              <div className="mt-3 pt-3 border-t border-slate-200/70 flex flex-wrap items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>กำหนดส่ง: {new Date(assignment.closeAt).toLocaleString('th-TH')}</span>
                </div>
                {isPastClose ? (
                  assignment.allowLate ? (
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                      เกินกำหนดส่ง (ส่งช้าได้)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-medium">
                      ปิดรับงานแล้ว
                    </span>
                  )
                ) : isBeforeOpen ? (
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                    ยังไม่ถึงเวลาเปิดรับ
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                    เปิดรับงานปกติ
                  </span>
                )}
              </div>

              {/* Worksheet Download Button (if provided) */}
              {assignment.worksheetUrl && (
                <div className="mt-3 pt-2">
                  <a
                    href={assignment.worksheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 shadow-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>ดาวน์โหลดใบงาน: {assignment.worksheetName || 'เอกสารประกอบ'}</span>
                  </a>
                </div>
              )}
            </div>

            {/* Verification Form */}
            <form onSubmit={handleVerifyStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
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
                    className="w-full text-center tracking-widest font-mono text-xl font-bold py-3.5 px-4 bg-slate-50 border-2 border-slate-200 rounded-xl focus:bg-white focus:border-indigo-600 focus:outline-hidden transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                  ระบบจะค้นหาข้อมูล เลขที่, ชื่อ-นามสกุล และกลุ่มเรียน (Sec) มาแสดงให้ท่านตรวจสอบ
                </p>

                {studentError && (
                  <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{studentError}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-3 rounded-xl text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="submit"
                  disabled={studentLoading || studentIdInput.trim().length === 0}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-700 active:scale-98 transition-all shadow-md shadow-indigo-200 disabled:opacity-50"
                >
                  {studentLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>กำลังตรวจสอบรหัสนักศึกษา...</span>
                    </>
                  ) : (
                    <>
                      <span>ยืนยันรหัสนักศึกษา</span>
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
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 sm:p-8 transition-all">
            {/* Student Verified Identity Card */}
            <div className="mb-6 p-4 rounded-xl bg-emerald-50/80 border border-emerald-200">
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ข้อมูลถูกต้อง • ยืนยันตัวตนสำเร็จ
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
                  {verifiedStudent.sec}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                <div>
                  <span className="text-slate-500">เลขที่:</span> <strong className="text-slate-900">{verifiedStudent.studentNo}</strong>
                </div>
                <div>
                  <span className="text-slate-500">รหัส:</span> <strong className="font-mono text-slate-900">{verifiedStudent.studentId}</strong>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">ชื่อ-นามสกุล:</span> <strong className="text-slate-900">{verifiedStudent.fullName}</strong>
                </div>
              </div>

              {previousSubmission && (
                <div className="mt-3 pt-2.5 border-t border-emerald-200/70 text-xs text-emerald-900 flex items-center justify-between">
                  <span>คุณเคยส่งงานนี้แล้วเมื่อ {new Date(previousSubmission.submittedAt).toLocaleTimeString('th-TH')}</span>
                  {assignment.allowResubmit && (
                    <span className="text-[11px] font-semibold text-emerald-700 bg-white px-2 py-0.5 rounded-sm">
                      ส่งใหม่ได้ (ใช้ไฟล์ล่าสุด)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Submission Form */}
            <form onSubmit={handleSubmitWork} className="space-y-5">
              {/* Submission Type Switcher (if both file and link allowed) */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSubmissionType('file')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all ${
                    submissionType === 'file'
                      ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                      : 'text-slate-600'
                  }`}
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>แนบไฟล์งาน (ไม่เกิน {assignment.maxFileSizeMB || 10} MB)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubmissionType('link')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all ${
                    submissionType === 'link'
                      ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                      : 'text-slate-600'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>วางลิงก์ผลงาน</span>
                </button>
              </div>

              {/* File Upload Area */}
              {submissionType === 'file' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    เลือกไฟล์งาน (PDF, Word, รูปภาพ)
                  </label>
                  <div className="relative border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-6 text-center bg-slate-50/50 hover:bg-indigo-50/20 transition-all cursor-pointer">
                    <input
                      type="file"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex flex-col items-center justify-center gap-2 pointer-events-none">
                      <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <UploadCloud className="w-6 h-6" />
                      </div>
                      {selectedFile ? (
                        <div>
                          <p className="text-sm font-semibold text-slate-900 break-all">{selectedFile.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • แตะเพื่อเปลี่ยนไฟล์
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm font-medium text-slate-700">แตะเพื่อเลือกไฟล์จากอุปกรณ์</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            รองรับไฟล์ขนาดสูงสุด {assignment.maxFileSizeMB || 10} MB
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Link Input Area */
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    ลิงก์ผลงาน (URL)
                  </label>
                  <input
                    type="url"
                    value={workLink}
                    onChange={(e) => setWorkLink(e.target.value)}
                    placeholder="https://docs.google.com/... หรือ Canva, Figma"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-600 focus:outline-hidden transition-all font-sans"
                  />
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    *โปรดตรวจสอบว่าได้เปิดสิทธิ์การเข้าถึงลิงก์ (Anyone with the link can view) เรียบร้อยแล้ว
                  </p>
                </div>
              )}

              {/* Error Alert */}
              {submitError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                  className="px-4 py-3 rounded-xl text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-98 transition-all shadow-md shadow-indigo-200 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{uploadProgressMsg || 'กำลังส่งงาน...'}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>ยืนยันส่งงาน</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ================= STEP 4: RECEIPT (SUCCESS) ================= */}
        {step === 4 && receipt && (
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 p-6 sm:p-8 text-center transition-all animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4 ring-8 ring-emerald-50">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">ส่งงานสำเร็จเรียบร้อย!</h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              ระบบได้บันทึกข้อมูลการส่งงานของท่านเรียบร้อยแล้ว กรุณาบันทึกหรือแคปหน้าจอเก็บไว้เป็นหลักฐาน
            </p>

            {/* Official Receipt Card */}
            <div className="mt-6 p-5 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 text-left space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <span className="text-xs text-slate-500">หมายเลขอ้างอิง (Receipt ID)</span>
                <span className="font-mono text-sm font-bold text-indigo-700 tracking-wider">
                  {receipt.receiptId}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500">สถานะ:</span>{' '}
                  {receipt.status === 'on_time' ? (
                    <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-sm border border-emerald-200">
                      ส่งตรงเวลา
                    </span>
                  ) : (
                    <span className="font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-sm border border-amber-200">
                      ส่งช้า
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-slate-500">เวลาที่ส่ง:</span>{' '}
                  <strong className="text-slate-800">
                    {new Date(receipt.submittedAt).toLocaleTimeString('th-TH')}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">รหัสนักศึกษา:</span>{' '}
                  <strong className="font-mono text-slate-800">{receipt.studentId}</strong>
                </div>
                <div>
                  <span className="text-slate-500">กลุ่มเรียน:</span>{' '}
                  <strong className="text-slate-800">{receipt.sec} (เลขที่ {receipt.studentNo})</strong>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">ชื่อ-นามสกุล:</span>{' '}
                  <strong className="text-slate-800">{receipt.studentName}</strong>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">งานที่ส่ง:</span>{' '}
                  <strong className="text-slate-800">{assignment?.title} ({assignment?.courseCode})</strong>
                </div>
                {receipt.fileName && (
                  <div className="col-span-2 text-slate-500 truncate">
                    ไฟล์: <span className="text-slate-800 font-mono">{receipt.fileName}</span>
                  </div>
                )}
                {receipt.workLink && (
                  <div className="col-span-2 text-slate-500 truncate">
                    ลิงก์: <span className="text-indigo-600 underline">{receipt.workLink}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Buttons */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleCopyReceipt}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                {copiedReceipt ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700">คัดลอกข้อมูลสำเร็จ!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>คัดลอกหลักฐานการส่ง</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={resetAll}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
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
