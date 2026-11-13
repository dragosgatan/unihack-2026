import { Route, Routes } from 'react-router';

export function PatientRoutes() {
  return (
    <Routes>
      <Route index element={<h1 className="p-6 text-3xl font-bold">Patient</h1>} />
    </Routes>
  );
}
