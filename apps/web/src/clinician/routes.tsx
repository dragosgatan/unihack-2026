import { Route, Routes } from 'react-router';

export function ClinicianRoutes() {
  return (
    <Routes>
      <Route index element={<h1 className="p-6 text-3xl font-bold">Clinician</h1>} />
    </Routes>
  );
}
