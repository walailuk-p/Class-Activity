/**
 * Google Apps Script (GAS) Service for Google Drive file uploads
 * Enables file storage on Google Drive under Firebase Spark (Free) plan without Firebase Storage.
 */

export interface GASUploadMetadata {
  studentId: string;
  studentName: string;
  assignmentCode: string;
  courseCode?: string;
}

export interface GASUploadResponse {
  success: boolean;
  fileUrl: string;
  webViewLink?: string;
  fileName: string;
  fileSize: number;
  message?: string;
}

/**
 * Upload a file to Google Drive via Google Apps Script Web App
 */
export async function uploadFileToGoogleDriveViaGAS(
  file: File,
  gasWebAppUrl: string,
  metadata: GASUploadMetadata
): Promise<GASUploadResponse> {
  if (!gasWebAppUrl || !gasWebAppUrl.startsWith('https://script.google.com/')) {
    throw new Error('กรุณาระบุ URL ของ Google Apps Script Web App ที่ถูกต้อง');
  }

  // Convert file to Base64
  const base64Data = await readFileAsBase64(file);

  const payload = {
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    base64: base64Data,
    studentId: metadata.studentId,
    studentName: metadata.studentName,
    assignmentCode: metadata.assignmentCode,
    courseCode: metadata.courseCode || ''
  };

  try {
    const response = await fetch(gasWebAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', // text/plain prevents CORS preflight issues with GAS
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`การอัพโหลดไม่สำเร็จ (HTTP Status ${response.status})`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Google Apps Script รายงานข้อผิดพลาดในการบันทึกไฟล์');
    }

    return {
      success: true,
      fileUrl: result.downloadUrl || result.webViewLink || result.fileUrl,
      webViewLink: result.webViewLink,
      fileName: file.name,
      fileSize: file.size,
      message: 'อัพโหลดไปยัง Google Drive สำเร็จ'
    };
  } catch (err: any) {
    console.error('GAS Upload Error:', err);
    throw new Error(err.message || 'ไม่สามารถเชื่อมต่อกับ Google Apps Script ได้ กรุณาตรวจสอบสิทธิ์การแชร์ของ Web App (Who has access: Anyone)');
  }
}

/**
 * Helper to convert File to base64 string
 */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      // Strip header: data:image/png;base64,
      const commaIdx = res.indexOf(',');
      if (commaIdx !== -1) {
        resolve(res.substring(commaIdx + 1));
      } else {
        resolve(res);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * Ready-to-deploy Google Apps Script Code template for instructors
 */
export const GAS_TEMPLATE_CODE = `/**
 * ====================================================================
 * ClassWork - Google Apps Script Drive Uploader (Spark Free Plan)
 * บันทึกไฟล์งานของนักศึกษาลงใน Google Drive ของอาจารย์โดยตรง
 * ====================================================================
 * 
 * วิธีการติดตั้ง (ใช้เวลา 2 นาที):
 * 1. ไปที่ https://script.google.com แล้วกดปุ่ม "New project"
 * 2. ลบโค้ดเดิมทั้งหมด แล้วคัดลอกโค้ดนี้ไปวาง
 * 3. กดปุ่ม "Deploy" (การทำให้ใช้งานได้) -> "New deployment" (การทำให้ใช้งานได้รายการใหม่)
 * 4. เลือกประเภท: "Web app" (เว็บแอป)
 * 5. ตั้งค่า:
 *    - Description: ClassWork Drive Storage
 *    - Execute as: "Me" (ตัวฉัน - ใช้อีเมลของคุณ)
 *    - Who has access: "Anyone" (ทุกคน)  <-- สำคัญมาก! เพื่อให้นักศึกษาส่งไฟล์ได้โดยไม่ต้องล็อกอิน
 * 6. กด "Deploy" และกด "Authorize access" (ให้สิทธิ์การเข้าถึง Google Drive)
 * 7. คัดลอก "Web app URL" (ลงท้ายด้วย /exec) มาวางในระบบ ClassWork
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var filename = data.filename || 'submission.bin';
    var mimeType = data.mimeType || 'application/octet-stream';
    var base64 = data.base64;
    var studentId = data.studentId || 'unknown';
    var studentName = data.studentName || 'student';
    var assignmentCode = data.assignmentCode || 'general';
    var courseCode = data.courseCode || '';

    // โฟลเดอร์หลัก
    var rootFolderName = "ClassWork_Submissions";
    var rootFolders = DriveApp.getFoldersByName(rootFolderName);
    var rootFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(rootFolderName);

    // โฟลเดอร์ประจำงาน (แบ่งตามรหัสงาน)
    var assignmentFolderName = (courseCode ? courseCode + "_" : "") + "Assignment_" + assignmentCode;
    var assignFolders = rootFolder.getFoldersByName(assignmentFolderName);
    var targetFolder = assignFolders.hasNext() ? assignFolders.next() : rootFolder.createFolder(assignmentFolderName);

    // สร้างชื่อไฟล์ที่เป็นระเบียบ: รหัสนักศึกษา_ชื่อ_ชื่อไฟล์เดิม
    var safeFilename = studentId + "_" + studentName.replace(/\\s+/g, '_') + "_" + filename;

    // แปลง base64 เป็น Blob และบันทึก
    var decoded = Utilities.base64Decode(base64);
    var blob = Utilities.newBlob(decoded, mimeType, safeFilename);
    var file = targetFolder.createFile(blob);
    
    // ตั้งค่าสิทธิ์ให้อาจารย์และผู้มีลิงก์เปิดดูได้
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var response = {
      success: true,
      fileId: file.getId(),
      fileName: safeFilename,
      webViewLink: file.getUrl(),
      downloadUrl: file.getDownloadUrl(),
      message: "File uploaded successfully to Google Drive"
    };

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    var errorResponse = {
      success: false,
      error: error.toString()
    };
    return ContentService.createTextOutput(JSON.stringify(errorResponse))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var response = {
    status: "active",
    name: "ClassWork Google Drive Storage Service",
    timestamp: new Date().toISOString()
  };
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
