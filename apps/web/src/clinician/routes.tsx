import { Route, Routes } from 'react-router';
import { Browse, BrowseDomain, BrowseMetric } from './Browse.tsx';
import { MetricDetail } from './MetricDetail.tsx';
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
        <Route path="patients/:patientId/metrics/:metricId" element={<MetricDetail />} />
        <Route path="browse" element={<Browse />} />
        <Route path="browse/:domain" element={<BrowseDomain />} />
        <Route path="browse/:domain/:metricId" element={<BrowseMetric />} />
      </Route>
    </Routes>
  );
}
