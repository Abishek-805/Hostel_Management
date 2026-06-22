const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';
const API_BASE = `${BASE_URL}/api`;

function unique(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function request(method, path, body, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { ok: res.ok, status: res.status, data };
}

function must(result, label) {
  if (!result.ok) {
    const err = new Error(`${label} failed (${result.status}): ${JSON.stringify(result.data)}`);
    err.result = result;
    throw err;
  }
}

function printSummary(ok, out, error) {
  if (ok) {
    console.log('\n=== GATE SMOKE TEST: PASS ===');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Total steps passed: ${out.steps.length}`);
    for (const step of out.steps) {
      console.log(`PASS: ${step}`);
    }
    console.log(`Attendance locked: ${out.attendanceLocked}`);
    console.log(`Attendance status: ${out.attendanceStatus}`);
    console.log(`Scan records count: ${out.scanRecordsCount}`);
  } else {
    console.log('\n=== GATE SMOKE TEST: FAIL ===');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Steps passed before failure: ${out.steps.length}`);
    for (const step of out.steps) {
      console.log(`PASS: ${step}`);
    }
    console.log(`FAIL: ${error?.message || 'Unknown failure'}`);
    if (error?.result) {
      console.log(`Failure response: ${JSON.stringify(error.result)}`);
    }
  }
}

(async () => {
  const out = { steps: [] };
  try {
    const hostelBlock = 'Valluvar Mens Hostel';
    const hostelLatitude = 11.273453635146646;
    const hostelLongitude = 77.60697973507233;

    const studentReg = unique('GATE_STUDENT');
    const adminReg = unique('GATE_ADMIN');
    const gateReg = unique('GATE_KEEPER');

    const studentPassword = 'Pass123!';
    const adminPassword = 'Admin123!';
    const gatePassword = 'Gate123!';

    const studentRegister = await request('POST', '/auth/register', {
      registerId: studentReg,
      password: studentPassword,
      name: 'Gate Student',
      phone: '9000000001',
      role: 'student',
      hostelBlock,
    });
    must(studentRegister, 'Student register');
    out.steps.push('student_register_ok');

    const adminRegister = await request('POST', '/auth/register', {
      registerId: adminReg,
      password: adminPassword,
      name: 'Gate Admin',
      phone: '9000000002',
      role: 'admin',
      hostelBlock,
    });
    must(adminRegister, 'Admin register');
    out.steps.push('admin_register_ok');

    let gateRegister;
    for (let gateNumber = 1; gateNumber <= 11; gateNumber++) {
      // eslint-disable-next-line no-await-in-loop
      const attempt = await request('POST', '/auth/register', {
        registerId: `${gateReg}_${gateNumber}`,
        password: gatePassword,
        name: 'Gate Keeper',
        phone: '9000000003',
        role: 'gatekeeper',
        gateNumber,
        gateCode: `gate-${gateNumber}-code`,
      });

      if (attempt.ok) {
        gateRegister = attempt;
        out.gateNumberUsed = gateNumber;
        out.gateRegisterId = `${gateReg}_${gateNumber}`;
        break;
      }
    }

    if (!gateRegister?.ok) {
      throw new Error('Gatekeeper register failed for all gate numbers 1-11');
    }
    out.steps.push('gatekeeper_register_ok');

    const studentLogin = await request('POST', '/auth/login', { registerId: studentReg, password: studentPassword, role: 'student' });
    must(studentLogin, 'Student login');
    const studentToken = studentLogin.data.token;
    const studentId = studentLogin.data.user.id;
    out.steps.push('student_login_ok');

    const adminLogin = await request('POST', '/auth/login', { registerId: adminReg, password: adminPassword, role: 'admin' });
    must(adminLogin, 'Admin login');
    const adminToken = adminLogin.data.token;
    out.steps.push('admin_login_ok');

    const gateLogin = await request('POST', '/auth/login', { registerId: out.gateRegisterId, password: gatePassword, role: 'gatekeeper' });
    must(gateLogin, 'Gatekeeper login');
    const gateToken = gateLogin.data.token;
    out.steps.push('gatekeeper_login_ok');

    const pass1Create = await request('POST', '/gate/passes', {
      category: 'PERSONAL',
      reason: 'Library visit',
      destination: 'City Library',
      expectedReturnTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    }, studentToken);
    must(pass1Create, 'Pass1 create');
    const pass1Id = pass1Create.data.gatePass.gatePassId;
    out.steps.push('pass1_create_ok');

    const pass1Approve = await request('POST', `/gate/passes/${pass1Id}/approve`, {}, adminToken);
    must(pass1Approve, 'Pass1 approve');
    out.steps.push('pass1_approve_ok');

    const pass1Exit = await request('POST', `/gate/passes/${pass1Id}/mark-exit`, {}, gateToken);
    must(pass1Exit, 'Pass1 mark-exit');
    out.steps.push('pass1_exit_ok');

    const qrCampus = await request('GET', `/gate/passes/${pass1Id}/qr-token?stage=CAMPUS_ENTRY`, null, studentToken);
    must(qrCampus, 'Pass1 campus QR');

    const pass1CampusScan = await request('POST', '/gate/scan/campus-entry', {
      token: qrCampus.data.token,
      latitude: 10.0,
      longitude: 78.0,
    }, gateToken);
    must(pass1CampusScan, 'Pass1 campus scan');
    out.steps.push('pass1_campus_scan_ok');

    const qrHostel = await request('GET', `/gate/passes/${pass1Id}/qr-token?stage=HOSTEL_ENTRY`, null, studentToken);
    must(qrHostel, 'Pass1 hostel QR');

    const pass1HostelScan = await request('POST', '/gate/scan/hostel-entry', {
      token: qrHostel.data.token,
      latitude: hostelLatitude,
      longitude: hostelLongitude,
    }, gateToken);
    must(pass1HostelScan, 'Pass1 hostel scan');
    out.steps.push('pass1_hostel_scan_ok');

    const pass2Create = await request('POST', '/gate/passes', {
      category: 'PERSONAL',
      reason: 'Medical follow-up',
      destination: 'Clinic',
      expectedReturnTime: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    }, studentToken);
    must(pass2Create, 'Pass2 create');
    const pass2Id = pass2Create.data.gatePass.gatePassId;
    out.steps.push('pass2_create_ok');

    const pass2Approve = await request('POST', `/gate/passes/${pass2Id}/approve`, {}, adminToken);
    must(pass2Approve, 'Pass2 approve');
    out.steps.push('pass2_approve_ok');

    const pass2Exit = await request('POST', `/gate/passes/${pass2Id}/mark-exit`, {}, gateToken);
    must(pass2Exit, 'Pass2 mark-exit');
    out.steps.push('pass2_exit_ok');

    const qrLateCampus = await request('GET', `/gate/passes/${pass2Id}/qr-token?stage=CAMPUS_ENTRY`, null, studentToken);
    must(qrLateCampus, 'Pass2 campus QR');

    const pass2CampusScan = await request('POST', '/gate/scan/campus-entry', {
      token: qrLateCampus.data.token,
      latitude: 10.0,
      longitude: 78.0,
    }, gateToken);
    must(pass2CampusScan, 'Pass2 campus scan');
    out.steps.push('pass2_campus_scan_ok_late_lock_expected');

    const gateMy = await request('GET', '/gate/passes/my', null, studentToken);
    must(gateMy, 'Gate my passes');
    out.attendanceLocked = Boolean(gateMy.data?.gateState?.attendanceLocked);

    const attendanceTry = await request('POST', '/attendances', {
      userId: studentId,
      date: new Date().toISOString(),
      isPresent: false,
      reason: 'smoke test',
    }, studentToken);

    out.attendanceStatus = attendanceTry.status;
    out.attendanceBody = attendanceTry.data;

    if (attendanceTry.status !== 403) {
      throw new Error(`Attendance lock check failed: expected 403, got ${attendanceTry.status} ${JSON.stringify(attendanceTry.data)}`);
    }
    out.steps.push('attendance_lock_confirmed_403');

    const scanRecords = await request('GET', '/gate-scan-records?limit=20', null, adminToken);
    must(scanRecords, 'Gate scan records list');
    out.scanRecordsCount = Array.isArray(scanRecords.data?.records) ? scanRecords.data.records.length : -1;
    out.steps.push('scan_records_route_ok');

    printSummary(true, out);
    console.log(JSON.stringify({ ok: true, out }, null, 2));
  } catch (error) {
    printSummary(false, out, error);
    console.error(JSON.stringify({ ok: false, error: error.message, result: error.result || null, out }, null, 2));
    process.exit(1);
  }
})();
