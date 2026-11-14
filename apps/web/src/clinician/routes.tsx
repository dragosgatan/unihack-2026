import { Route, Routes } from 'react-router';
import { Browse, BrowseDomain, BrowseMetric } from './Browse.tsx';
import { CheckIn } from './CheckIn.tsx';
import { MetricDetail } from './MetricDetail.tsx';
import { PairPhone } from './PairPhone.tsx';
import { PatientScreen } from './PatientScreen.tsx';
import { SessionSummary } from './SessionSummary.tsx';
import { Sessions } from './Sessions.tsx';
import { Patients } from './Patients.tsx';
import { ClinicianShell } from './Shell.tsx';
import { SignIn } from './SignIn.tsx';
import { SuggestionsHistory } from './SuggestionsHistory.tsx';
import { Symmetry } from './Symmetry.tsx';
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
        <Route path="patients/:patientId/symmetry" element={<Symmetry />} />
        <Route path="patients/:patientId/check-in" element={<CheckIn />} />
        <Route path="patients/:patientId/sessions" element={<Sessions />} />
        <Route path="patients/:patientId/sessions/:sessionId" element={<SessionSummary />} />
        <Route path="patients/:patientId/suggestions" element={<SuggestionsHistory />} />
        <Route path="patients/:patientId/devices" element={<PairPhone />} />
        <Route path="browse" element={<Browse />} />
        <Route path="browse/:domain" element={<BrowseDomain />} />
        <Route path="browse/:domain/:metricId" element={<BrowseMetric />} />
      </Route>
    </Routes>
  );
}
