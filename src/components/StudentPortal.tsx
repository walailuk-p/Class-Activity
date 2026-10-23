import React, { useState, useEffect, useRef } from 'react';
import * as htmlToImage from 'html-to-image';
import html2canvas from 'html2canvas';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileText,
  Loader2,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  Users,
  Copy,
  Check,
  Info
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
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

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
    setUploadProgressMsg('กำลังบันทึกไฟล์งาน');

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
          setUploadProgressMsg('กำลังบันทึกไฟล์งาน');
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
          setUploadProgressMsg('กำลังบันทึกไฟล์งาน');
          finalFileUrl = `[บันทึกเฉพาะชื่อไฟล์]: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`;
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

  const formatThaiDate = (isoString?: string) => {
    if (!isoString) return '-';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    const thaiMonths = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];
    const day = d.getDate();
    const month = thaiMonths[d.getMonth()];
    const year = d.getFullYear() + 543;
    const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${day} ${month} ${year} (${time})`;
  };

  const formatThaiDueDate = (isoString?: string) => {
    if (!isoString) return '-';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    const thaiDays = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
    const thaiMonths = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    const dayName = thaiDays[d.getDay()];
    const day = d.getDate();
    const month = thaiMonths[d.getMonth()];
    const year = d.getFullYear() + 543;
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${dayName}ที่ ${day} ${month} ${year} ภายในเวลา ${hours}.${minutes} น.`;
  };

  const handleDownloadReceiptImage = async () => {
    if (!receipt || !receiptRef.current) return;
    setIsDownloadingImage(true);
    try {
      let dataUrl: string;
      try {
        dataUrl = await htmlToImage.toPng(receiptRef.current, {
          cacheBust: true,
          backgroundColor: '#f8faf6',
          quality: 1.0,
          pixelRatio: 2,
          width: 1024,
          skipFonts: true, // Prevents reading cross-origin Google Fonts stylesheets which throws SecurityError
        });
      } catch (primaryErr) {
        console.warn('htmlToImage with skipFonts failed, falling back to html2canvas:', primaryErr);
        const canvas = await html2canvas(receiptRef.current, {
          backgroundColor: '#f8faf6',
          scale: 2,
          width: 1024,
          useCORS: true,
          logging: false,
        });
        dataUrl = canvas.toDataURL('image/png', 1.0);
      }

      const cleanStudentId = receipt.studentId.trim().replace(/[/\\?%*:|"<>]/g, '');
      const cleanName = receipt.studentName.trim().replace(/[/\\?%*:|"<>]/g, '');
      const cleanSec = receipt.sec.trim().replace(/[/\\?%*:|"<>]/g, '');
      const cleanTitle = (assignment?.title || assignment?.courseCode || 'งานที่ส่ง').trim().replace(/[/\\?%*:|"<>]/g, '');
      const fileName = `${cleanStudentId}_${cleanName}_${cleanSec}_${cleanTitle}.png`;

      const link = document.createElement('a');
      link.download = fileName;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Failed to generate receipt image:', error);
      alert('ไม่สามารถสร้างรูปภาพได้ กรุณาแคปหน้าจอเพื่อเก็บหลักฐาน');
    } finally {
      setIsDownloadingImage(false);
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
    <div className="min-h-[calc(100vh-5rem)] py-6 px-4 sm:px-6">
      <div className={`mx-auto transition-all duration-300 ${step === 4 ? 'max-w-6xl' : 'max-w-xl'}`}>
        {/* Step Indicator Header with Cute Pill Steps */}
        <div className="mb-7">
          <div className="flex items-center justify-between px-2 text-xs font-semibold">
            <span className={`flex items-center gap-1.5 transition-colors ${step >= 1 ? 'text-indigo-600 font-bold' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step >= 1 ? 'bg-indigo-500 text-white shadow-xs' : 'bg-slate-200 text-slate-500'}`}>1</span>
              <span>รหัสงาน</span>
            </span>
            <span className={`flex items-center gap-1.5 transition-colors ${step >= 2 ? 'text-indigo-600 font-bold' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step >= 2 ? 'bg-indigo-500 text-white shadow-xs' : 'bg-slate-200 text-slate-500'}`}>2</span>
              <span>ยืนยันตัวตน</span>
            </span>
            <span className={`flex items-center gap-1.5 transition-colors ${step >= 3 ? 'text-indigo-600 font-bold' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step >= 3 ? 'bg-indigo-500 text-white shadow-xs' : 'bg-slate-200 text-slate-500'}`}>3</span>
              <span>ส่งงาน</span>
            </span>
            <span className={`flex items-center gap-1.5 transition-colors ${step >= 4 ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step >= 4 ? 'bg-emerald-500 text-white shadow-xs' : 'bg-slate-200 text-slate-500'}`}>4</span>
              <span>สถานะการส่งงาน</span>
            </span>
          </div>
          <div className="mt-3 h-2 w-full bg-slate-200/80 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400 rounded-full transition-all duration-400 ease-out"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* ================= STEP 1: ASSIGNMENT CODE ================= */}
        {step === 1 && (
          <div className="bg-white/95 backdrop-blur-xs rounded-3xl shadow-pastel border border-indigo-50/80 p-6 sm:p-8 transition-all">
            <div className="text-center mb-6">
              <div className="inline-flex p-3.5 rounded-2xl bg-gradient-to-tr from-indigo-100 via-purple-50 to-pink-100 text-indigo-600 mb-3 shadow-pastel-sm">
                <Sparkles className="w-7 h-7 text-indigo-500" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">ระบบส่งงานในชั้นเรียน</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                กรอกรหัสงาน 6 หลักที่อาจารย์แจ้งในห้องเรียน เพื่อเริ่มส่งงาน
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
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
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
                    className="w-full text-center tracking-[0.25em] font-mono text-2xl font-bold py-3.5 px-4 bg-slate-50/90 border-2 border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-400 focus:outline-hidden transition-all uppercase placeholder:normal-case placeholder:tracking-normal placeholder:font-sans placeholder:text-slate-400 placeholder:text-base shadow-2xs"
                  />
                </div>
                {codeError && (
                  <div className="mt-2.5 p-3 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{codeError}</span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={codeLoading || assignmentCode.trim().length === 0}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:scale-98 transition-all shadow-pastel-sm disabled:opacity-50 disabled:shadow-none cursor-pointer"
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
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>ไม่ต้อง Log In อีเมล • รองรับทุกอุปกรณ์</span>
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
          <div className="bg-white/95 backdrop-blur-xs rounded-3xl shadow-pastel border border-indigo-50/80 p-6 sm:p-8 transition-all">
            {/* Assignment Card Header */}
            <div className="mb-6 p-5 rounded-2xl bg-gradient-to-br from-indigo-50/50 via-purple-50/30 to-sky-50/40 border border-indigo-100/70">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span className="font-semibold text-indigo-700 bg-white/90 px-3 py-1 rounded-full border border-indigo-100 shadow-2xs">
                  {assignment.courseCode}
                </span>
                <span className="font-mono font-bold text-slate-600">รหัสงาน: {assignment.code}</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-2">{assignment.title}</h2>
              {assignment.description && (
                <p className="text-xs sm:text-sm text-slate-600 mt-1 line-clamp-2">{assignment.description}</p>
              )}

              {/* Deadline & Status */}
              <div className="mt-4 pt-3 border-t border-indigo-100/70 flex flex-wrap items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>กำหนดส่ง: {new Date(assignment.closeAt).toLocaleString('th-TH')}</span>
                </div>
                {isPastClose ? (
                  assignment.allowLate ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                      เกินกำหนดส่ง (ส่งช้าได้)
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-medium">
                      ปิดรับงานแล้ว
                    </span>
                  )
                ) : isBeforeOpen ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                    ยังไม่ถึงเวลาเปิดรับ
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                    เปิดรับงานปกติ
                  </span>
                )}
              </div>

              {/* Worksheet Download Button (if provided) */}
              {assignment.worksheetUrl && (
                <div className="mt-4 p-3.5 rounded-2xl bg-gradient-to-r from-indigo-50/90 to-purple-50/70 border border-indigo-200/80 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white text-indigo-600 flex items-center justify-center shrink-0 shadow-2xs border border-indigo-100">
                      <FileText className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                        เอกสารใบงาน (Worksheet)
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-slate-800 truncate" title={assignment.worksheetName || 'เอกสารใบงาน'}>
                        {assignment.worksheetName || 'เอกสารใบงาน'}
                      </div>
                    </div>
                  </div>
                  <a
                    href={assignment.worksheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={assignment.worksheetName || 'worksheet'}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-pastel-sm transition-all shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>ดาวน์โหลด</span>
                  </a>
                </div>
              )}
            </div>

            {/* Verification Form */}
            <form onSubmit={handleVerifyStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
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
                    className="w-full text-center tracking-widest font-mono text-xl font-bold py-3.5 px-4 bg-slate-50/90 border-2 border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-400 focus:outline-hidden transition-all shadow-2xs"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-2 text-center">
                  ระบบจะค้นหาข้อมูล เลขที่, ชื่อ-นามสกุล และกลุ่มเรียน (Sec) มาแสดงให้ท่านตรวจสอบ
                </p>

                {studentError && (
                  <div className="mt-3 p-3 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{studentError}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-3 rounded-2xl text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="submit"
                  disabled={studentLoading || studentIdInput.trim().length === 0}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-2xl font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:scale-98 transition-all shadow-pastel-sm disabled:opacity-50 cursor-pointer"
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
          <div className="bg-white/95 backdrop-blur-xs rounded-3xl shadow-pastel border border-indigo-50/80 p-6 sm:p-8 transition-all">
            {/* Student Verified Identity Card */}
            <div className="mb-6 p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200/70">
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ข้อมูลถูกต้อง • ยืนยันตัวตนสำเร็จ
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
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
                    <span className="text-[11px] font-semibold text-emerald-700 bg-white px-2.5 py-0.5 rounded-full border border-emerald-200">
                      ส่งใหม่ได้ (ใช้ไฟล์ล่าสุด)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Submission Form */}
            <form onSubmit={handleSubmitWork} className="space-y-5">
              {/* File Upload Area */}
              {submissionType === 'file' ? (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-700">
                    เลือกไฟล์งาน (PDF, Word, รูปภาพ)
                  </label>

                  {!assignment.gasWebAppUrl && (
                    <div className="p-3 rounded-2xl bg-amber-50/90 border border-amber-200/90 text-amber-800 text-xs flex items-center gap-2">
                      <Info className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>ℹ️ โจทย์งานนี้ยังไม่ได้เชื่อมต่อระบบจัดเก็บไฟล์ Google Drive ไฟล์ของคุณจะถูกบันทึกเฉพาะชื่อไฟล์ในระบบ</span>
                    </div>
                  )}

                  <div className="relative border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-3xl p-6 text-center bg-indigo-50/20 hover:bg-indigo-50/40 transition-all cursor-pointer">
                    <input
                      type="file"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex flex-col items-center justify-center gap-2 pointer-events-none">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-100/70 text-indigo-600 flex items-center justify-center shadow-2xs">
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
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:bg-white focus:border-indigo-400 focus:outline-hidden transition-all font-sans"
                  />
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    *โปรดตรวจสอบว่าได้เปิดสิทธิ์การเข้าถึงลิงก์ (Anyone with the link can view) เรียบร้อยแล้ว
                  </p>
                </div>
              )}

              {/* Error Alert */}
              {submitError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs flex items-start gap-2">
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
                  className="px-4 py-3 rounded-2xl text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:scale-98 transition-all shadow-pastel-sm disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{uploadProgressMsg || 'กำลังบันทึกไฟล์งาน'}</span>
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

        {/* ================= STEP 4: SUBMISSION REPORT (SUCCESS) ================= */}
        {step === 4 && receipt && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Top notification banner */}
            <div className="text-center">
              <div className="inline-flex p-3 rounded-2xl bg-[#e7f3ec] text-[#055e42] mb-2 shadow-xs ring-4 ring-emerald-50">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">ส่งงานสำเร็จเรียบร้อย!</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                ระบบได้บันทึกข้อมูลการส่งงานของคุณเรียบร้อยแล้ว ตรวจสอบรายงานผลและดาวน์โหลดหลักฐานด้านล่าง
              </p>
            </div>

            {/* Scrollable container for mobile to maintain 1024px report proportions */}
            <div className="w-full overflow-x-auto no-scrollbar pb-4 flex justify-start lg:justify-center">
              {/* Formal Report Template Container: Explicit 1024px Fixed Width for High-Resolution Export */}
              <div
                ref={receiptRef}
                className="w-[1024px] shrink-0 bg-[#f8faf6] p-8 text-slate-800 font-['Prompt',sans-serif] relative overflow-hidden border border-slate-200 rounded-3xl shadow-xl space-y-6"
              >
                {/* Geometric Green Corner Accent Top Right */}
                <div className="absolute top-0 right-0 w-36 h-36 overflow-hidden pointer-events-none">
                  <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#055e42] rotate-45 transform origin-center shadow-md"></div>
                  <div className="absolute -top-16 -right-16 w-32 h-32 bg-[#0a7e58] rotate-45 transform origin-center opacity-80"></div>
                </div>

                {/* Geometric Green Corner Accent Bottom Right */}
                <div className="absolute bottom-0 right-0 w-24 h-24 overflow-hidden pointer-events-none opacity-30">
                  <div className="absolute -bottom-14 -right-14 w-28 h-28 bg-[#055e42] rotate-45 transform origin-center"></div>
                </div>

                {/* 1. Header Section */}
                <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 relative z-10">
                  {/* Left: Diamond Logo Badge + Institution Name */}
                  <div className="flex items-center gap-3.5">
                    <div className="w-13 h-13 rounded-2xl bg-[#055e42] flex items-center justify-center text-white shadow-md shadow-[#055e42]/20 shrink-0">
                      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 3h12l4 6-10 12L2 9z" />
                        <path d="M11 3L8 9l4 12 4-12-3-6" />
                        <path d="M2 9h20" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-black tracking-widest text-[#055e42] uppercase leading-tight font-sans">
                        SCHOOL OF BUSINESS ADMINISTRATION
                      </p>
                      <p className="text-[11px] font-bold tracking-wider text-[#0a7e58] uppercase leading-tight mt-0.5">
                        BANGKOK UNIVERSITY
                      </p>
                    </div>
                  </div>

                  {/* Center: Large dark green circle check icon + Bold Title */}
                  <div className="text-center px-4">
                    <div className="inline-flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#055e42] text-white flex items-center justify-center shadow-xs">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <h2 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                        ASSIGNMENT SUBMISSION REPORT
                      </h2>
                    </div>
                    <p className="text-xs font-bold text-[#055e42] tracking-wider mt-0.5">
                      รายงานผลการส่งงาน
                    </p>
                  </div>

                  {/* Top Right: Receipt ID badge */}
                  <div className="text-right shrink-0 pr-6">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-[#c3e4d2] text-[#055e42] font-mono text-xs font-black shadow-xs">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#055e42] animate-pulse"></span>
                      <span className="tracking-wider">{receipt.receiptId}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Upper Content Section (2-Column Main Information) */}
                <div className="grid grid-cols-12 gap-6 items-stretch relative z-10">
                  {/* Left Main Column: Untruncated Full Details List */}
                  <div className="col-span-8 bg-white/95 p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                      {/* 1. ชื่อ-นามสกุล */}
                      <div className="flex items-start gap-2.5">
                        <span className="shrink-0 px-3.5 py-1 rounded-full bg-[#055e42] text-white font-bold text-xs shadow-2xs">
                          ชื่อ-นามสกุล
                        </span>
                        <span className="text-sm font-bold text-slate-900 leading-snug pt-0.5 break-words">
                          {receipt.studentName}
                        </span>
                      </div>

                      {/* 5. รหัสนักศึกษา */}
                      <div className="flex items-start gap-2.5">
                        <span className="shrink-0 px-3.5 py-1 rounded-full bg-[#055e42] text-white font-bold text-xs shadow-2xs">
                          รหัสนักศึกษา
                        </span>
                        <span className="text-sm font-mono font-bold text-slate-900 leading-snug pt-0.5">
                          {receipt.studentId}
                        </span>
                      </div>

                      {/* 2. วิชาที่ส่ง */}
                      <div className="flex items-start gap-2.5">
                        <span className="shrink-0 px-3.5 py-1 rounded-full bg-[#055e42] text-white font-bold text-xs shadow-2xs">
                          วิชาที่ส่ง
                        </span>
                        <span className="text-sm font-bold text-slate-900 leading-snug pt-0.5 break-words">
                          {assignment?.title || ''} {assignment?.courseCode ? `(${assignment.courseCode})` : ''}
                        </span>
                      </div>

                      {/* 6. กลุ่มเรียน */}
                      <div className="flex items-start gap-2.5">
                        <span className="shrink-0 px-3.5 py-1 rounded-full bg-[#055e42] text-white font-bold text-xs shadow-2xs">
                          กลุ่มเรียน
                        </span>
                        <span className="text-sm font-bold text-slate-900 leading-snug pt-0.5">
                          {receipt.sec} {receipt.studentNo ? `(เลขที่ ${receipt.studentNo})` : ''}
                        </span>
                      </div>

                      {/* 3. ไฟล์ที่ส่ง (No clipping / untruncated) */}
                      <div className="col-span-2 flex items-start gap-2.5">
                        <span className="shrink-0 px-3.5 py-1 rounded-full bg-[#055e42] text-white font-bold text-xs shadow-2xs">
                          ไฟล์ที่ส่ง
                        </span>
                        <span className="text-xs font-semibold text-slate-800 leading-snug pt-1 break-all">
                          {receipt.fileName || receipt.workLink || 'ไฟล์ผลงานในระบบ'}
                        </span>
                      </div>

                      {/* 4. วันที่ส่ง */}
                      <div className="col-span-2 flex items-start gap-2.5">
                        <span className="shrink-0 px-3.5 py-1 rounded-full bg-[#055e42] text-white font-bold text-xs shadow-2xs">
                          วันที่ส่ง
                        </span>
                        <span className="text-xs font-bold text-slate-900 leading-snug pt-1">
                          {formatThaiDate(receipt.submittedAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Highlight Card: Submission Confirmation Box */}
                  <div className="col-span-4 bg-[#e7f3ec] border-2 border-[#b8dfca] rounded-2xl p-5 flex flex-col items-center justify-center text-center shadow-xs">
                    {/* Dark green check icon badge */}
                    <div className="w-14 h-14 rounded-full bg-[#055e42] text-white flex items-center justify-center shadow-md mb-2">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>

                    <span className="font-extrabold text-[#055e42] text-lg">
                      ส่งงานสำเร็จ
                    </span>

                    {/* Document illustration icon */}
                    <div className="w-16 h-16 rounded-2xl bg-white border border-[#b8dfca] shadow-xs flex items-center justify-center text-[#055e42] my-2.5">
                      <FileCheck className="w-9 h-9" />
                    </div>

                    <p className="text-xs text-[#055e42] font-semibold leading-relaxed max-w-[220px]">
                      ระบบได้รับไฟล์งานของคุณเรียบร้อยแล้ว ขอบคุณที่ส่งงาน
                    </p>
                  </div>
                </div>

                {/* 3. Lower Section: Green Section Header Bar + 4-Column Grid */}
                <div className="space-y-3 relative z-10">
                  {/* Full width green header bar */}
                  <div className="bg-[#055e42] text-white py-2.5 px-4 rounded-xl font-bold text-sm tracking-wide flex items-center gap-2 shadow-xs">
                    <FileText className="w-4 h-4 text-emerald-300" />
                    <span>รายละเอียดการส่งงาน</span>
                  </div>

                  {/* 4-Column Grid */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 grid grid-cols-4 gap-4 divide-x divide-slate-200 shadow-2xs">
                    {/* 1. กำหนดส่งงาน */}
                    <div className="px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 mb-1">
                        <Calendar className="w-3.5 h-3.5 text-[#055e42]" />
                        <span>กำหนดส่งงาน</span>
                      </div>
                      <p className="text-xs font-bold text-slate-800 leading-snug">
                        {formatThaiDueDate(assignment?.closeAt)}
                      </p>
                    </div>

                    {/* 2. สถานะ */}
                    <div className="px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 mb-1">
                        <FileText className="w-3.5 h-3.5 text-[#055e42]" />
                        <span>สถานะ</span>
                      </div>
                      <p className="text-xs font-bold text-slate-800">ส่งงานเรียบร้อย</p>
                      <span className={`inline-block mt-1 px-3 py-0.5 rounded-full text-[11px] font-bold border ${
                        receipt.status === 'on_time'
                          ? 'bg-emerald-100 text-[#055e42] border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}>
                        {receipt.status === 'on_time' ? 'สำเร็จ (ตรงเวลา)' : 'สำเร็จ (ส่งช้า)'}
                      </span>
                    </div>

                    {/* 3. เวลาที่ส่ง */}
                    <div className="px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 mb-1">
                        <Clock className="w-3.5 h-3.5 text-[#055e42]" />
                        <span>เวลาที่ส่ง</span>
                      </div>
                      <p className="text-sm font-bold font-mono text-slate-900 mt-1">
                        {new Date(receipt.submittedAt).toLocaleTimeString('th-TH')}
                      </p>
                    </div>

                    {/* 4. กลุ่มเรียน */}
                    <div className="px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 mb-1">
                        <Users className="w-3.5 h-3.5 text-[#055e42]" />
                        <span>กลุ่มเรียน</span>
                      </div>
                      <p className="text-sm font-bold font-mono text-slate-900 mt-1">
                        {receipt.sec}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 4. Footer Signature Section */}
                <div className="pt-4 border-t border-slate-200/80 flex items-end justify-between text-xs relative z-10">
                  {/* Bottom Left: Footer text separated by green diamond accents */}
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 bg-[#055e42] rotate-45 transform"></div>
                    <span className="text-xs font-black tracking-widest text-[#055e42] uppercase font-sans">
                      BANGKOK UNIVERSITY | SCHOOL OF BUSINESS ADMINISTRATION
                    </span>
                    <div className="w-2.5 h-2.5 bg-[#055e42] rotate-45 transform"></div>
                  </div>

                  {/* Bottom Right: Teacher Signature */}
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-500 mb-1">ลงชื่อผู้ตรวจสอบ</p>
                    <div className="font-serif italic text-xl font-bold text-[#055e42] tracking-wider underline decoration-[#055e42]/50 underline-offset-4">
                      A.Walailuk Peanchai
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 max-w-xl mx-auto pt-2">
              <button
                type="button"
                onClick={handleDownloadReceiptImage}
                disabled={isDownloadingImage}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 px-5 rounded-2xl text-xs sm:text-sm font-semibold text-white bg-[#055e42] hover:bg-[#044c35] active:scale-98 transition-all shadow-pastel-sm disabled:opacity-70 cursor-pointer"
              >
                {isDownloadingImage ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>กำลังสร้างรูปภาพ...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>ดาวน์โหลดหลักฐานการส่ง</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={resetAll}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 px-5 rounded-2xl text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/80 transition-all shadow-2xs cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>ส่งงานวิชาอื่น</span>
              </button>
            </div>

            {/* Secondary fallback copy text button */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={handleCopyReceipt}
                className="text-xs text-slate-500 hover:text-[#055e42] font-medium inline-flex items-center gap-1.5 transition-colors"
              >
                {copiedReceipt ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600">คัดลอกข้อความหลักฐานแล้ว</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>คัดลอกข้อความหลักฐาน</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
