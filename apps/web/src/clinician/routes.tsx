import { Route, Routes } from 'react-router';
import { Browse, BrowseDomain } from './Browse.tsx';
import { PatientScreen } from './PatientScreen.tsx';
import { Patients } from './Patients.tsx';
import { ClinicianShell } from './Shell.tsx';
import { SignIn } from './SignIn.tsx';
import { Summary } from './Summary.tsx';

export function ClinicianRoutes() {
  return (
    <Routes>
      <Route path="login" element={<SignIn />} />
      <Route element={<ClinicianShell />}>
        <Route index element={<Summary />} />
        <Route path="patients" element={<Patients />} />
        <Route path="patients/:patientId" element={<PatientScreen />} />
        <Route path="browse" element={<Browse />} />
        <Route path="browse/:domain" element={<BrowseDomain />} />
      </Route>
    </Routes>
  );
}
